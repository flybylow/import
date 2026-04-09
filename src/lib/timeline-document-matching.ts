/**
 * Maps real-world construction documents (Belgian / NL context) to `timeline:eventAction`
 * and default `timeline:source` hints. Single place for product + ingest code to stay aligned.
 *
 * Spec: `docs/timeline-first-and-document-matching.md`
 */

import type { TimelineEventAction } from "@/lib/timeline-events-vocab";
import { TIMELINE_EVENT_ACTIONS } from "@/lib/timeline-events-vocab";

/** Document kinds we explicitly place on the audit timeline today or in near-term ingest. */
export type TimelineDocumentKind =
  | "leveringsbon"
  | "werfverslag"
  | "technische_fiche"
  | "bestek_milestone"
  /** Path / URL / id recorded via Deliveries → PID or timeline form — not a file upload in-app. */
  | "project_document_reference"
  /** File bytes under `data/<projectId>-documents/` via document upload API. */
  | "project_document_original";

export type TimelineDocumentMatch = {
  kind: TimelineDocumentKind;
  /** Dutch / BE labels for stakeholders (not exhaustive). */
  labelsNl: string[];
  eventAction: TimelineEventAction;
  /** Typical `timeline:source` when emitted by tooling (manual form may use `form`). */
  defaultSource?: string;
  /** Other files often updated together (not timeline TTL). */
  companionArtifacts?: string[];
};

export const TIMELINE_DOCUMENT_MATCHES: readonly TimelineDocumentMatch[] = [
  {
    kind: "leveringsbon",
    labelsNl: ["Leveringsbon", "Afleverbon"],
    eventAction: "delivery_document_added",
    defaultSource: "deliveries-ingest",
    companionArtifacts: ["data/<projectId>-deliveries.ttl (optional append)"],
  },
  {
    kind: "werfverslag",
    labelsNl: ["Werfverslag", "Bouwverslag", "Rapport werfbezoek"],
    eventAction: "site_report_added",
    defaultSource: "form",
    companionArtifacts: [],
  },
  {
    kind: "technische_fiche",
    labelsNl: ["Technische fiche", "Productfiche"],
    eventAction: "evidence_linked",
    defaultSource: "form",
    companionArtifacts: [],
  },
  {
    kind: "bestek_milestone",
    labelsNl: ["Bestek save", "Bindings milestone"],
    eventAction: "bestek_bindings_milestone",
    defaultSource: "deliveries-bestek",
    companionArtifacts: [
      "data/<projectId>-bestek-bindings.json",
      "data/<projectId>-phase0-element-groups.json",
    ],
  },
  {
    kind: "project_document_reference",
    labelsNl: ["Projectdocument", "Bijlage", "Referentie", "DMS-pad"],
    eventAction: "document_reference_logged",
    defaultSource: "form",
    companionArtifacts: [],
  },
  {
    kind: "project_document_original",
    labelsNl: ["Factuur", "Foto werf", "Scan", "Oorspronkelijk bestand"],
    eventAction: "document_original_stored",
    defaultSource: "deliveries-document-upload",
    companionArtifacts: ["data/<projectId>-documents/<eventId>/…"],
  },
] as const;

const KIND_TO_ACTION = new Map<TimelineDocumentKind, TimelineDocumentMatch>(
  TIMELINE_DOCUMENT_MATCHES.map((m) => [m.kind, m])
);

export function matchForTimelineDocumentKind(
  kind: TimelineDocumentKind
): TimelineDocumentMatch | undefined {
  return KIND_TO_ACTION.get(kind);
}

/** Ensures every declared action is a known vocabulary literal (fails tests if vocab drifts). */
export function assertTimelineDocumentMatchesUseVocabulary(): void {
  const allowed = new Set<string>(TIMELINE_EVENT_ACTIONS);
  for (const m of TIMELINE_DOCUMENT_MATCHES) {
    if (!allowed.has(m.eventAction)) {
      throw new Error(
        `timeline-document-matching: ${m.kind} uses unknown eventAction ${m.eventAction}`
      );
    }
  }
}
