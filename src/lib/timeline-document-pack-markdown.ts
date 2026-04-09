import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import { TIMELINE_EVENT_LABELS } from "@/lib/timeline-events-vocab";
import { formatDossierTimestamp } from "@/lib/pid-dossier-from-timeline";
import {
  PID_MILESTONE_LABELS,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import { lifecycleActorDisplayLabel } from "@/lib/timeline-lifecycle-overview";

function tsMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function sortChrono(events: ParsedTimelineEvent[]): ParsedTimelineEvent[] {
  return [...events].sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso));
}

/** Actions we surface in the “document trail” section (export narrative). */
const DOCUMENT_TRAIL_ACTIONS = new Set<string>([
  "document_reference_logged",
  "document_original_stored",
  "delivery_document_added",
  "site_report_added",
  "evidence_linked",
  "bestek_bindings_milestone",
]);

function mdInline(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

function actorLine(ev: ParsedTimelineEvent): string {
  return lifecycleActorDisplayLabel({
    actorSystem: ev.actorSystem,
    actorLabel: ev.actorLabel,
    source: ev.source,
  });
}

function eventBullet(ev: ParsedTimelineEvent): string {
  const label = TIMELINE_EVENT_LABELS[ev.eventAction];
  const when = formatDossierTimestamp(ev.timestampIso);
  const who = actorLine(ev);
  const lines: string[] = [`- **${label}** · ${when} · ${who}`];
  if (ev.eventAction === "pid_reference_milestone") {
    const mk = ev.pidReferenceFields?.milestoneKey;
    if (mk && isPidMilestoneKey(mk)) {
      lines.push(`  - Milestone: ${PID_MILESTONE_LABELS[mk]} (\`${mk}\`)`);
    }
    const ph = ev.pidReferenceFields?.lifecyclePhase?.trim();
    if (ph) lines.push(`  - Phase: \`${ph}\``);
    const st = ev.pidReferenceFields?.stateHint?.trim();
    if (st) lines.push(`  - State hint: ${mdInline(st)}`);
  }
  if (ev.eventAction === "document_original_stored" && ev.documentStorageFields) {
    const d = ev.documentStorageFields;
    lines.push(`  - Stored: \`data/${d.storedRelPath.replace(/`/g, "'")}\``);
    lines.push(`  - Original filename: ${mdInline(d.originalFilename)}`);
    lines.push(`  - Size: ${d.byteLength} bytes`);
    if (d.mimeType?.trim()) lines.push(`  - MIME: \`${d.mimeType.trim()}\``);
    if (d.category?.trim()) lines.push(`  - Category: \`${d.category.trim()}\``);
  }
  const msg = ev.message?.trim();
  if (msg) {
    lines.push(`  - Message:`);
    lines.push(``);
    for (const ln of msg.replace(/\r\n/g, "\n").split("\n")) {
      lines.push(`    > ${ln.replace(/^>/, "\\>")}`);
    }
  }
  lines.push(`  - \`eventId\`: \`${ev.eventId}\``);
  return lines.join("\n");
}

/**
 * Single Markdown document: PID milestones, document-related trail, then full chronology.
 * Suitable for paste into Word / Confluence or `pandoc` → PDF.
 */
export function buildTimelineDocumentPackMarkdown(
  projectId: string,
  events: ParsedTimelineEvent[]
): string {
  const generatedAt = new Date().toISOString();
  const sorted = sortChrono(events);

  const pidRows = sorted.filter((e) => e.eventAction === "pid_reference_milestone");
  const docRows = sorted.filter((e) => DOCUMENT_TRAIL_ACTIONS.has(e.eventAction));

  const lines: string[] = [
    `# Project audit pack`,
    ``,
    `- **Project id:** \`${projectId}\``,
    `- **Generated:** ${generatedAt}`,
    ``,
    `This file is derived from \`data/${projectId}-timeline.ttl\`. It is a **read-only narrative** of the append-only audit log — not a substitute for originals in your DMS or \`data/\` sidecars.`,
    ``,
    `## PID milestones`,
    ``,
  ];

  if (pidRows.length === 0) {
    lines.push(`_No \`pid_reference_milestone\` rows._`, ``);
  } else {
    for (const ev of pidRows) {
      lines.push(eventBullet(ev), ``);
    }
  }

  lines.push(`## Document trail`, ``);
  if (docRows.length === 0) {
    lines.push(
      `_No document-related actions yet (e.g. \`document_reference_logged\`, \`document_original_stored\`, delivery or site reports, evidence, bestek save)._`,
      ``
    );
  } else {
    for (const ev of docRows) {
      lines.push(eventBullet(ev), ``);
    }
  }

  lines.push(`## Full chronology`, ``);
  if (sorted.length === 0) {
    lines.push(`_Timeline is empty._`, ``);
  } else {
    for (const ev of sorted) {
      lines.push(eventBullet(ev), ``);
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
