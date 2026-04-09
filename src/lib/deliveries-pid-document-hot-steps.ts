/**
 * Drive Deliveries → PID “document” panel from {@link PHASE_DOCUMENT_EXPECTATIONS} + timeline,
 * so the section reads as a dynamic next-step list (not a generic sign-off).
 */

import {
  PHASE_DOCUMENT_EXPECTATIONS,
  matchExpectationEvents,
  type PhaseDocumentExpectation,
} from "@/lib/lifecycle-phase-document-expectations";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import { groupLifecycleEventsByPhase } from "@/lib/timeline-lifecycle-overview";
import type { ReferencePhaseId } from "@/lib/timeline-reference-phase";

export type PidDocumentHotStepEmphasis =
  | "upload"
  | "reference"
  | "pid_milestone"
  | "ingest"
  | "other";

export type PidDocumentHotStep = {
  expectation: PhaseDocumentExpectation;
  emphasis: PidDocumentHotStepEmphasis;
  /** One line for the UI */
  instruction: string;
};

function emphasisFromExpectation(exp: PhaseDocumentExpectation): PidDocumentHotStepEmphasis {
  if (exp.guidanceOnly) return "reference";
  const m = exp.match;
  if (!m) return "other";
  if (m.pidMilestoneKeys?.length) return "pid_milestone";
  if (m.eventActions?.includes("delivery_document_added")) return "ingest";
  if (m.eventActions?.includes("document_original_stored")) return "upload";
  if (m.eventActions?.includes("document_reference_logged")) return "reference";
  return "other";
}

function buildInstruction(exp: PhaseDocumentExpectation, emphasis: PidDocumentHotStepEmphasis): string {
  const ex0 = exp.mockExamples?.[0]?.trim();
  switch (emphasis) {
    case "pid_milestone":
      return `Use Register PID milestone on this tab for “${exp.label}”, then add proof here if you have a file or external link.`;
    case "ingest":
      return `Prefer Deliveries → Ingest for a leveringsbon, or attach the PDF below or log a reference.`;
    case "upload":
      return `Store original file below — title e.g. ${ex0 ?? exp.label}.`;
    case "reference":
      return exp.guidanceOnly
        ? `Optional: log a reference below for typical dossier items (e.g. ${ex0 ?? "see mock examples"}).`
        : `Log reference below — e.g. ${ex0 ?? "path, URL, or DMS id"}.`;
    default:
      return `Record the right timeline action (${exp.formatHints.join(" · ")}) or add supporting upload or reference.`;
  }
}

/**
 * Open trace slots (not yet matched in this phase) + guidance-only rows for the document panel.
 */
export function pidDocumentHotStepsForPhase(
  phase: ReferencePhaseId,
  events: LifecycleOverviewEvent[]
): { missing: PidDocumentHotStep[]; guidance: PidDocumentHotStep[] } {
  const buckets = groupLifecycleEventsByPhase(events);
  const phaseEvents = buckets.phases.find((p) => p.phase === phase)?.events ?? [];
  const exps = PHASE_DOCUMENT_EXPECTATIONS[phase];
  const missing: PidDocumentHotStep[] = [];
  const guidance: PidDocumentHotStep[] = [];

  for (const exp of exps) {
    if (exp.guidanceOnly) {
      const em = emphasisFromExpectation(exp);
      guidance.push({
        expectation: exp,
        emphasis: em,
        instruction: buildInstruction(exp, em),
      });
      continue;
    }
    if (!exp.match) continue;
    if (matchExpectationEvents(phaseEvents, exp).length > 0) continue;
    const em = emphasisFromExpectation(exp);
    missing.push({
      expectation: exp,
      emphasis: em,
      instruction: buildInstruction(exp, em),
    });
  }

  return { missing, guidance };
}
