/**
 * Controlled vocabulary for audit timeline events (PID / append-only log).
 * Keep this file free of Node-only imports so client components can import labels safely.
 *
 * **Documents & uploads:** Ingest and UI paths append rows using these `eventAction` literals;
 * project files under `data/` (bindings, deliveries TTL, …) pair with those events so the
 * timeline stays the single sortable story. See `docs/timeline-first-and-document-matching.md`
 * (§ “Events system: documents → timeline”).
 */

export const TIMELINE_NS = "https://tabulas.eu/timeline#";

/**
 * Default IFC express id for timeline events: the form selects this so every log line
 * targets the same element unless the user picks “No target”.
 */
export const TIMELINE_DEFAULT_TARGET_EXPRESS_ID = 33028;

/** Dropdown options for target express id (value "" = omit in API). */
export const TIMELINE_TARGET_EXPRESS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "No element link" },
  {
    value: String(TIMELINE_DEFAULT_TARGET_EXPRESS_ID),
    label: `Example id (${TIMELINE_DEFAULT_TARGET_EXPRESS_ID})`,
  },
];

/** Stable action ids stored as `timeline:eventAction` literals in TTL. */
export const TIMELINE_EVENT_ACTIONS = [
  "model_imported",
  "parse_enrich_completed",
  "kb_built",
  "calculation_run",
  "compliance_evaluation_recorded",
  "delivery_document_added",
  /** Manual log of a project document path, URL, DMS id, or similar (pairs with `data/` + timeline). */
  "document_reference_logged",
  /** Binary stored under `data/<projectId>-documents/<eventId>/` — origin event for uploaded originals. */
  "document_original_stored",
  "site_report_added",
  "evidence_linked",
  "manual_note",
  "data_exported",
  /** Ingested GS1 EPCIS (supply-chain) events via POST /api/timeline/epcis */
  "epcis_supply_chain_event",
  /** MS Project / planning XML → construction schedule task (see scripts/import-*-msproject-timeline) */
  "construction_schedule_task",
  /** BCF 2.0 markup import (coordination / clash follow-up) */
  "bcf_coordination_event",
  /** Bestek: architect named an auto IFC-type group (/deliveries bestek UI) */
  "bestek_element_group_binding",
  /** One milestone per Save bindings — links many row events via shared batch id */
  "bestek_bindings_milestone",
  /** Contractor / procurement linked real products to bestek groups */
  "product_coupling_updated",
  /** Belgian reference lifecycle / PID process milestone (structured `pidMilestoneKey` in TTL) */
  "pid_reference_milestone",
] as const;

export type TimelineEventAction = (typeof TIMELINE_EVENT_ACTIONS)[number];

export const TIMELINE_EVENT_LABELS: Record<TimelineEventAction, string> = {
  model_imported: "Model imported (IFC)",
  parse_enrich_completed: "Parse & enrich completed",
  kb_built: "Knowledge base built",
  calculation_run: "Carbon calculation run",
  compliance_evaluation_recorded: "Compliance evaluation recorded",
  delivery_document_added: "Delivery document added",
  document_reference_logged: "Document reference logged",
  document_original_stored: "Document original stored",
  site_report_added: "Site report added",
  evidence_linked: "Evidence linked to element / material",
  manual_note: "Manual note",
  data_exported: "Data exported",
  epcis_supply_chain_event: "EPCIS supply-chain event",
  construction_schedule_task: "Construction schedule task",
  bcf_coordination_event: "BCF coordination issue",
  bestek_element_group_binding: "Bestek — element group named",
  bestek_bindings_milestone: "Bestek — bindings saved (milestone)",
  product_coupling_updated: "Product coupling updated (contractor)",
  pid_reference_milestone: "PID / process milestone",
};

const ACTION_SET = new Set<string>(TIMELINE_EVENT_ACTIONS);

export function isTimelineEventAction(s: string): s is TimelineEventAction {
  return ACTION_SET.has(s);
}
