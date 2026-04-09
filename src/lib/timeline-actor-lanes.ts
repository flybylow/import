/**
 * Fixed actor lanes for `/timeline?view=lifecycle` phase cards.
 * Each event increments exactly one lane for its reference phase (see `eventReferencePhase`).
 *
 * | Lane            | `timeline:eventAction` (and notes) |
 * |-----------------|--------------------------------------|
 * | **Bouwheer** (`bo`) | `pid_reference_milestone`, `manual_note`, `data_exported`, `compliance_evaluation_recorded` |
 * | **Architect**   | `model_imported`, `parse_enrich_completed`, `kb_built`, `calculation_run`, `bestek_element_group_binding`, `bestek_bindings_milestone` |
 * | **Construction**| `delivery_document_added`, `document_reference_logged`, `document_original_stored`, `site_report_added`, `evidence_linked`, `epcis_supply_chain_event`, `product_coupling_updated`, `construction_schedule_task`, `bcf_coordination_event` |
 * | **Other**       | `actorSystem` rows; anything not listed above |
 */

import type { TimelineEventAction } from "@/lib/timeline-events-vocab";

export const ACTOR_LANE_IDS = ["bo", "architect", "construction", "other"] as const;

export type ActorLaneId = (typeof ACTOR_LANE_IDS)[number];

export const ACTOR_LANE_LABELS: Record<ActorLaneId, string> = {
  bo: "Bouwheer",
  architect: "Architect",
  construction: "Construction",
  other: "Other",
};

/** Stable column order in the UI */
export const ACTOR_LANE_ORDER: readonly ActorLaneId[] = [
  "bo",
  "architect",
  "construction",
  "other",
];

type LaneInput = {
  eventAction: TimelineEventAction;
  actorSystem: boolean;
};

export function actorLaneForTimelineEvent(ev: LaneInput): ActorLaneId {
  if (ev.actorSystem) return "other";

  switch (ev.eventAction) {
    case "pid_reference_milestone":
    case "manual_note":
    case "data_exported":
    case "compliance_evaluation_recorded":
      return "bo";

    case "model_imported":
    case "parse_enrich_completed":
    case "kb_built":
    case "calculation_run":
    case "bestek_element_group_binding":
    case "bestek_bindings_milestone":
      return "architect";

    case "delivery_document_added":
    case "document_reference_logged":
    case "document_original_stored":
    case "site_report_added":
    case "evidence_linked":
    case "epcis_supply_chain_event":
    case "product_coupling_updated":
    case "construction_schedule_task":
    case "bcf_coordination_event":
      return "construction";

    default:
      return "other";
  }
}
