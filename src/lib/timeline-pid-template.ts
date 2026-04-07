import { randomUUID } from "crypto";

import type { TimelineEventPayload } from "@/lib/timeline-events";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  type PidMilestoneKey,
} from "@/lib/timeline-pid-milestones";

/**
 * Per-milestone hints for a **template** PID timeline (not authoritative).
 * Keys follow `PID_MILESTONE_KEYS` order.
 */
export const PID_TEMPLATE_ROW_META: Record<
  PidMilestoneKey,
  { lifecyclePhase: string; stateHint: string }
> = {
  spec_baseline: { lifecyclePhase: "0", stateHint: "Design / spec" },
  pid_opened: { lifecyclePhase: "1", stateHint: "OPENED" },
  as_built_package_recorded: { lifecyclePhase: "3", stateHint: "Completion package" },
  pid_finalized: { lifecyclePhase: "3", stateHint: "FINALIZED" },
  pv_provisional_signed: { lifecyclePhase: "4", stateHint: "VERIFIED" },
  warranty_defect: { lifecyclePhase: "5", stateHint: "LIVE" },
  warranty_repair: { lifecyclePhase: "5", stateHint: "LIVE" },
  pv_final_signed: { lifecyclePhase: "6", stateHint: "WARRANTIED" },
  modification_recorded: { lifecyclePhase: "7", stateHint: "EVOLVING" },
  property_transferred: { lifecyclePhase: "8", stateHint: "TRANSFERRED" },
  demolition_inventory: { lifecyclePhase: "9", stateHint: "ARCHIVED" },
};

const TEMPLATE_MESSAGE =
  "Template seed — placeholder dates; edit or re-log with real business dates when known.";

export type BuildPidTemplateOptions = {
  /** Start of first event (UTC). Defaults to today. */
  baseMs: number;
  /** Days between consecutive milestones (default 30). */
  spacingDays: number;
};

/**
 * Builds payloads for all allowlisted PID milestones in lifecycle order.
 * Timestamps are synthetic spacing from `baseMs` for a readable demo strip.
 */
export function buildPidTemplateEventPayloads(opts: BuildPidTemplateOptions): TimelineEventPayload[] {
  const spacingDays = Math.min(3650, Math.max(1, Math.floor(opts.spacingDays) || 30));
  const dayMs = 86400000;
  return PID_MILESTONE_KEYS.map((key, index) => {
    const meta = PID_TEMPLATE_ROW_META[key];
    const ts = new Date(opts.baseMs + index * spacingDays * dayMs);
    return {
      eventId: randomUUID(),
      timestampIso: ts.toISOString(),
      actorSystem: false,
      actorLabel: "pid-template-seed",
      eventAction: "pid_reference_milestone",
      source: "pid-template-seed",
      message: `${TEMPLATE_MESSAGE} (${PID_MILESTONE_LABELS[key]})`,
      pidReferenceFields: {
        milestoneKey: key,
        lifecyclePhase: meta.lifecyclePhase,
        stateHint: meta.stateHint,
      },
    };
  });
}
