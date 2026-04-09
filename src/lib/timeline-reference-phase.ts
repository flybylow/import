/**
 * Belgian **reference lifecycle** phases (0–9) for PID / construction narrative.
 * Maps allowlisted PID milestones to a phase — single source for template seed + lifecycle overview.
 * See docs/pid-lifecycle-timeline-events.md §2.
 */

import {
  PID_MILESTONE_KEYS,
  type PidMilestoneKey,
} from "@/lib/timeline-pid-milestones";

export const REFERENCE_PHASE_IDS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const;

export type ReferencePhaseId = (typeof REFERENCE_PHASE_IDS)[number];

const PHASE_SET = new Set<string>(REFERENCE_PHASE_IDS);

export function isReferencePhaseId(s: string): s is ReferencePhaseId {
  return PHASE_SET.has(s);
}

export const REFERENCE_PHASE_LABELS: Record<ReferencePhaseId, string> = {
  "0": "Design / spec",
  "1": "PID opened",
  "2": "Site / delivery",
  "3": "Completion / as-built",
  "4": "Voorlopige oplevering",
  "5": "Warranty",
  "6": "Definitieve oplevering",
  "7": "Living / retrofit",
  "8": "Transfer",
  "9": "End of life",
};

/** Default custom-trace title in Deliveries · PID when no phase is chosen yet (`null` = strip on “All”). */
export function defaultSignoffTitleForReferencePhase(phase: ReferencePhaseId | null): string {
  if (phase == null) {
    return "Timeline note";
  }
  return REFERENCE_PHASE_LABELS[phase];
}

/** Canonical phase index per PID milestone key (template + overview). */
export const PID_MILESTONE_REFERENCE_PHASE: Record<PidMilestoneKey, ReferencePhaseId> = {
  spec_baseline: "0",
  pid_opened: "1",
  as_built_package_recorded: "3",
  pid_finalized: "3",
  pv_provisional_signed: "4",
  warranty_defect: "5",
  warranty_repair: "5",
  pv_final_signed: "6",
  modification_recorded: "7",
  property_transferred: "8",
  demolition_inventory: "9",
};

export function milestoneKeysForPhase(phase: string): PidMilestoneKey[] {
  return PID_MILESTONE_KEYS.filter((k) => PID_MILESTONE_REFERENCE_PHASE[k] === phase);
}
