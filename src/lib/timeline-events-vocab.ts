/**
 * Controlled vocabulary for audit timeline events (PID / append-only log).
 * Keep this file free of Node-only imports so client components can import labels safely.
 */

export const TIMELINE_NS = "https://tabulas.eu/timeline#";

/**
 * Default IFC express id for timeline events: the form selects this so every log line
 * targets the same element unless the user picks “No target”.
 */
export const TIMELINE_DEFAULT_TARGET_EXPRESS_ID = 33028;

/** Dropdown options for target express id (value "" = omit in API). */
export const TIMELINE_TARGET_EXPRESS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: String(TIMELINE_DEFAULT_TARGET_EXPRESS_ID), label: `Default (${TIMELINE_DEFAULT_TARGET_EXPRESS_ID})` },
  { value: "", label: "No target element" },
];

/** Stable action ids stored as `timeline:eventAction` literals in TTL. */
export const TIMELINE_EVENT_ACTIONS = [
  "model_imported",
  "parse_enrich_completed",
  "kb_built",
  "calculation_run",
  "compliance_evaluation_recorded",
  "delivery_document_added",
  "site_report_added",
  "evidence_linked",
  "manual_note",
  "data_exported",
  /** Ingested GS1 EPCIS (supply-chain) events via POST /api/timeline/epcis */
  "epcis_supply_chain_event",
] as const;

export type TimelineEventAction = (typeof TIMELINE_EVENT_ACTIONS)[number];

export const TIMELINE_EVENT_LABELS: Record<TimelineEventAction, string> = {
  model_imported: "Model imported (IFC)",
  parse_enrich_completed: "Parse & enrich completed",
  kb_built: "Knowledge base built",
  calculation_run: "Carbon calculation run",
  compliance_evaluation_recorded: "Compliance evaluation recorded",
  delivery_document_added: "Delivery document added",
  site_report_added: "Site report added",
  evidence_linked: "Evidence linked to element / material",
  manual_note: "Manual note",
  data_exported: "Data exported",
  epcis_supply_chain_event: "EPCIS supply-chain event",
};

const ACTION_SET = new Set<string>(TIMELINE_EVENT_ACTIONS);

export function isTimelineEventAction(s: string): s is TimelineEventAction {
  return ACTION_SET.has(s);
}
