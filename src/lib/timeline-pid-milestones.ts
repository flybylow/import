/**
 * Allowlist for `timeline:pidMilestoneKey` on `pid_reference_milestone` audit events.
 * Aligns with docs/pid-lifecycle-timeline-events.md §2.
 */

export const PID_MILESTONE_KEYS = [
  "spec_baseline",
  "pid_opened",
  "as_built_package_recorded",
  "pid_finalized",
  "pv_provisional_signed",
  "warranty_defect",
  "warranty_repair",
  "pv_final_signed",
  "modification_recorded",
  "property_transferred",
  "demolition_inventory",
] as const;

export type PidMilestoneKey = (typeof PID_MILESTONE_KEYS)[number];

const KEY_SET = new Set<string>(PID_MILESTONE_KEYS);

export function isPidMilestoneKey(s: string): s is PidMilestoneKey {
  return KEY_SET.has(s);
}

/** Short labels for Deliveries PID tab + timeline UI */
export const PID_MILESTONE_LABELS: Record<PidMilestoneKey, string> = {
  spec_baseline: "Spec baseline (design / bestek)",
  pid_opened: "PID opened",
  as_built_package_recorded: "As-built package recorded",
  pid_finalized: "PID finalized",
  pv_provisional_signed: "PV voorlopige oplevering signed",
  warranty_defect: "Warranty — defect reported",
  warranty_repair: "Warranty — repair completed",
  pv_final_signed: "PV definitieve oplevering signed",
  modification_recorded: "Modification recorded",
  property_transferred: "Property transferred",
  demolition_inventory: "Demolition / end-of-life inventory",
};
