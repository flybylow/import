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
  spec_baseline: "Bestek & specification baseline — agreed",
  pid_opened: "PID process opened",
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

/**
 * Plain-language help for the Deliveries PID form (deep links + manual log).
 * Not legal advice — template for reuse across projects.
 */
export const PID_MILESTONE_REGISTER_BLURB: Record<
  PidMilestoneKey,
  { purpose: string; typicalDocuments: string }
> = {
  spec_baseline: {
    purpose:
      "Log when the written specification (bestek) and baseline quantities are agreed for this project.",
    typicalDocuments:
      "Bestek package, Deliveries → Bestek bindings, phase-0 IFC groups when you use them.",
  },
  pid_opened: {
    purpose: "Log when the PID dossier process is formally opened (living audit container).",
    typicalDocuments: "Whatever your organisation attaches to “PID opened” (letter, template ref, …).",
  },
  as_built_package_recorded: {
    purpose: "Log when the as-built / completion evidence package is brought together.",
    typicalDocuments: "As-built dossier, test reports, red-line set — as required by your contract.",
  },
  pid_finalized: {
    purpose: "Log when the PID is finalized as the regulated completion package.",
    typicalDocuments: "Signed PID bundle, annex list, handover checklist.",
  },
  pv_provisional_signed: {
    purpose: "Log provisional handover (voorlopige oplevering) when PV is signed.",
    typicalDocuments: "Signed PV voorlopig, snag lists, reservation list.",
  },
  warranty_defect: {
    purpose: "Log a warranty defect report.",
    typicalDocuments: "Defect report, photos, correspondence.",
  },
  warranty_repair: {
    purpose: "Log when a warranty repair is completed and accepted.",
    typicalDocuments: "Repair report, completion sign-off.",
  },
  pv_final_signed: {
    purpose: "Log final handover (definitieve oplevering) when PV is signed.",
    typicalDocuments: "Signed PV definitief, remaining reservations closed.",
  },
  modification_recorded: {
    purpose: "Log a material change or retrofit that must stay on the audit trail.",
    typicalDocuments: "Change order, revised drawings, new delivery evidence if applicable.",
  },
  property_transferred: {
    purpose: "Log transfer of the property or long-term responsibility.",
    typicalDocuments: "Notarial deed, transfer protocol, FM handover.",
  },
  demolition_inventory: {
    purpose: "Log end-of-life or demolition inventory when relevant.",
    typicalDocuments: "Inventory list, waste / recovery declarations.",
  },
};

/** Three macro bands — what to plan for (template); aligns with Deliveries PID headers. */
export const PID_MACRO_BAND_DOCUMENT_LINES: readonly string[] = [
  "Phases 0–1 — Design & spec: bestek, bindings, phase-0 groups; then “PID opened”.",
  "Phases 2–3 — Site & completion: leveringsbon, werfverslag, as-built package, PID finalized.",
  "Phases 4–9 — Handover & after: PVs, warranty, transfer, demolition / end-of-life.",
];

/** Dense matrix / swimlane captions (full labels stay in {@link PID_MILESTONE_LABELS}). */
export const PID_MILESTONE_SHORT_LABELS: Record<PidMilestoneKey, string> = {
  spec_baseline: "Bestek baseline",
  pid_opened: "PID opened",
  as_built_package_recorded: "As-built",
  pid_finalized: "PID finalized",
  pv_provisional_signed: "PV voorlopig",
  warranty_defect: "Warranty · defect",
  warranty_repair: "Warranty · repair",
  pv_final_signed: "PV definitief",
  modification_recorded: "Modification",
  property_transferred: "Transfer",
  demolition_inventory: "Demolition",
};
