import { randomUUID } from "crypto";

import type { TimelineEventPayload } from "@/lib/timeline-events";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  type PidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import { PID_MILESTONE_REFERENCE_PHASE } from "@/lib/timeline-reference-phase";
import { PID_TEMPLATE_PLACEHOLDER_NOTE } from "@/lib/timeline-pid-template-constants";

export { PID_TEMPLATE_PLACEHOLDER_NOTE } from "@/lib/timeline-pid-template-constants";

const TEMPLATE_STATE_HINTS: Record<PidMilestoneKey, string> = {
  spec_baseline: "Design / spec",
  pid_opened: "OPENED",
  as_built_package_recorded: "Completion package",
  pid_finalized: "FINALIZED",
  pv_provisional_signed: "VERIFIED",
  warranty_defect: "LIVE",
  warranty_repair: "LIVE",
  pv_final_signed: "WARRANTIED",
  modification_recorded: "EVOLVING",
  property_transferred: "TRANSFERRED",
  demolition_inventory: "ARCHIVED",
};

/**
 * Per-milestone hints for a **template** PID timeline (not authoritative).
 * Phase index comes from `PID_MILESTONE_REFERENCE_PHASE` (single source with lifecycle overview).
 */
export const PID_TEMPLATE_ROW_META: Record<
  PidMilestoneKey,
  { lifecyclePhase: string; stateHint: string }
> = PID_MILESTONE_KEYS.reduce(
  (acc, key) => {
    acc[key] = {
      lifecyclePhase: PID_MILESTONE_REFERENCE_PHASE[key],
      stateHint: TEMPLATE_STATE_HINTS[key],
    };
    return acc;
  },
  {} as Record<PidMilestoneKey, { lifecyclePhase: string; stateHint: string }>
);

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
      message: `${PID_TEMPLATE_PLACEHOLDER_NOTE} (${PID_MILESTONE_LABELS[key]})`,
      pidReferenceFields: {
        milestoneKey: key,
        lifecyclePhase: meta.lifecyclePhase,
        stateHint: meta.stateHint,
      },
    };
  });
}
