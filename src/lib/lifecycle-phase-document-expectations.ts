/**
 * Expected document / trace slots per Belgian reference phase (0–9), aligned with
 * `docs/pid-lifecycle-timeline-events.md` §2 and EPCIS (`epcis_supply_chain_event`).
 * Matching is done against events already bucketed by {@link eventReferencePhase}.
 */

import type { PidMilestoneKey } from "@/lib/timeline-pid-milestones";
import { isPidMilestoneKey } from "@/lib/timeline-pid-milestones";
import type { ReferencePhaseId } from "@/lib/timeline-reference-phase";
import { parseCustomSlotExpectationIdFromMessage } from "@/lib/deliveries-pid-custom-slot-message";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import type { TimelineEventAction } from "@/lib/timeline-events-vocab";

export type PhaseDocumentExpectation = {
  id: string;
  /** Short label for UI */
  label: string;
  /** Interop hints (EPCIS, IFC, DPP, …) */
  formatHints: string[];
  /**
   * How this row is satisfied from the timeline. Omit when {@link guidanceOnly} — no auto match.
   * For `eventActions`, **any** listed action in the phase bucket counts as satisfied.
   */
  match?: {
    eventActions?: TimelineEventAction[];
    pidMilestoneKeys?: PidMilestoneKey[];
  };
  /** Example filenames / dossier labels for demos (not authoritative). */
  mockExamples?: string[];
  /** Stakeholder checklist only — no green/red from timeline events (phase heuristics are coarse). */
  guidanceOnly?: boolean;
};

function expectationMatches(ev: LifecycleOverviewEvent, exp: PhaseDocumentExpectation): boolean {
  if (exp.guidanceOnly) return false;
  const slotId = parseCustomSlotExpectationIdFromMessage(ev.message ?? "");
  if (slotId && slotId === exp.id) return true;
  const m = exp.match;
  if (!m) return false;
  if (m.pidMilestoneKeys?.length && ev.eventAction === "pid_reference_milestone") {
    const mk = ev.pidReferenceFields?.milestoneKey;
    if (mk && isPidMilestoneKey(mk) && m.pidMilestoneKeys.includes(mk)) {
      return true;
    }
  }
  if (m.eventActions?.length && m.eventActions.includes(ev.eventAction)) {
    return true;
  }
  return false;
}

export function matchExpectationEvents(
  phaseEvents: LifecycleOverviewEvent[],
  exp: PhaseDocumentExpectation
): LifecycleOverviewEvent[] {
  return phaseEvents.filter((ev) => expectationMatches(ev, exp));
}

/** Research-backed checklist per phase — same vocabulary as `timeline:eventAction` + PID keys. */
export const PHASE_DOCUMENT_EXPECTATIONS: Record<ReferencePhaseId, PhaseDocumentExpectation[]> =
  {
    "0": [
      {
        id: "spec_baseline",
        label: "Spec / bestek baseline",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["spec_baseline"] },
        mockExamples: [
          "Lastenboek_hoofdstuk_09_isolatie.pdf",
          "Bijlage_technische_specificaties_daken.pdf",
        ],
      },
      {
        id: "bestek_bindings",
        label: "Bestek bindings saved",
        formatHints: ["Bestek batch JSON"],
        match: { eventActions: ["bestek_bindings_milestone"] },
        mockExamples: ["data/*-bestek-bindings.json (saved from Deliveries)"],
      },
      {
        id: "bim_model",
        label: "BIM model ingested",
        formatHints: ["IFC"],
        match: { eventActions: ["model_imported"] },
        mockExamples: ["Ontwerpmodel_2025-03.ifc", "Coordinatiemodel_AR-STR.ifc"],
      },
      {
        id: "enrich_kb",
        label: "Parse / enrich / KB",
        formatHints: ["Pipeline"],
        match: { eventActions: ["parse_enrich_completed", "kb_built", "calculation_run"] },
        mockExamples: ["Pipeline outputs: *-enriched.ttl, *-kb.ttl"],
      },
      {
        id: "bestek_groups",
        label: "Bestek ↔ IFC group links",
        formatHints: ["Bestek UI"],
        match: { eventActions: ["bestek_element_group_binding"] },
        mockExamples: ["IFC-type ↔ material rows in bestek UI"],
      },
    ],
    "1": [
      {
        id: "pid_opened",
        label: "PID opened",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["pid_opened"] },
        mockExamples: [
          "PID_openingsbesluit.pdf",
          "Procesnota_PID_rollen.docx",
        ],
      },
    ],
    "2": [
      {
        id: "delivery_note",
        label: "Delivery note (leveringsbon)",
        formatHints: ["DPP / deliveries TTL"],
        match: { eventActions: ["delivery_document_added"] },
        mockExamples: [
          "Leveringsbon_isolatieplaat_batch_4421.pdf",
          "Afleverbon_staalconstructie.pdf",
        ],
      },
      {
        id: "site_report",
        label: "Site report (werfverslag)",
        formatHints: ["Site log"],
        match: { eventActions: ["site_report_added"] },
        mockExamples: [
          "Werfverslag_2025-04-12_fotos.zip",
          "Rapport_werfbezoek_architect.pdf",
        ],
      },
      {
        id: "epcis",
        label: "Supply chain trace (EPCIS)",
        formatHints: ["GS1 EPCIS JSON → timeline:epcis*"],
        match: { eventActions: ["epcis_supply_chain_event"] },
      },
      {
        id: "evidence",
        label: "Evidence on elements / materials",
        formatHints: ["IFC link"],
        match: { eventActions: ["evidence_linked"] },
      },
      {
        id: "product_coupling",
        label: "Product ↔ bestek coupling",
        formatHints: ["Procurement"],
        match: { eventActions: ["product_coupling_updated"] },
      },
      {
        id: "schedule_bcf",
        label: "Schedule / BCF coordination",
        formatHints: ["MS Project", "BCF 2.0"],
        match: { eventActions: ["construction_schedule_task", "bcf_coordination_event"] },
        mockExamples: ["Planning_update_week_18.xml", "BCF_topic_ventilatie.bcfzip"],
      },
      {
        id: "stored_originals",
        label: "Stored originals (uploads)",
        formatHints: ["document_original_stored → data/*-documents/"],
        match: { eventActions: ["document_original_stored"] },
        mockExamples: [
          "Factuur_betonwerken_Q2.pdf",
          "Foto_bekisting_kelder_01.jpg",
          "CE_merkblad_EPD.pdf",
        ],
      },
      {
        id: "document_references",
        label: "External references (DMS / URL)",
        formatHints: ["document_reference_logged"],
        match: { eventActions: ["document_reference_logged"] },
        mockExamples: [
          "SharePoint → Offerte_gevelisolatie_signed.pdf",
          "TwinWorx link: technische fiche glaswol",
        ],
      },
    ],
    "3": [
      {
        id: "as_built_pkg",
        label: "As-built package",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["as_built_package_recorded"] },
      },
      {
        id: "pid_finalized",
        label: "PID finalized",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["pid_finalized"] },
      },
      {
        id: "data_export",
        label: "Data export / handover file",
        formatHints: ["Export bundle"],
        match: { eventActions: ["data_exported"] },
      },
      {
        id: "compliance",
        label: "Compliance evaluation",
        formatHints: ["Rules run"],
        match: { eventActions: ["compliance_evaluation_recorded"] },
      },
      {
        id: "handover_typical_pack",
        label: "Typical handover dossier (mock)",
        formatHints: [
          "Hint only — example filenames; not scored. Log links/uploads under Site / delivery (phase 2) on the timeline.",
        ],
        guidanceOnly: true,
        mockExamples: [
          "EPB_eindattest.pdf",
          "As-built_plannen_rev_F.pdf",
          "Handleidingen_HVAC_collectief.zip",
          "Keuringsverslagen_elektriciteit.pdf",
        ],
      },
    ],
    "4": [
      {
        id: "pv_prov",
        label: "Provisional delivery (PV voorlopig)",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["pv_provisional_signed"] },
        mockExamples: ["PV_voorlopig_getekend.pdf", "Snag_list_fase1.xlsx"],
      },
      {
        id: "pv_prov_mock_attachments",
        label: "Typical PV voorlopig bijlagen (mock)",
        formatHints: ["Photos, reservations, provisional measurements"],
        guidanceOnly: true,
        mockExamples: [
          "Fotoreportage_gebreken_werf.pdf",
          "Voorbehoudenlijst_aannemer.docx",
          "Meetstaat_voorlopige_oplevering.pdf",
        ],
      },
    ],
    "5": [
      {
        id: "warranty_defect",
        label: "Warranty — defect",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["warranty_defect"] },
      },
      {
        id: "warranty_repair",
        label: "Warranty — repair",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["warranty_repair"] },
      },
      {
        id: "warranty_mock_correspondence",
        label: "Typical warranty correspondence (mock)",
        formatHints: ["Emails, photos, contractor replies"],
        guidanceOnly: true,
        mockExamples: [
          "Klacht_vocht_badkamer_foto1.jpg",
          "Antwoord_aannemer_herstelplan.pdf",
          "Expertise_verslag_garantie.pdf",
        ],
      },
    ],
    "6": [
      {
        id: "pv_final",
        label: "Final delivery (PV definitief)",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["pv_final_signed"] },
        mockExamples: ["PV_definitief_getekend.pdf", "Eindschoonmaak_attest.pdf"],
      },
      {
        id: "pv_final_mock_pack",
        label: "Typical PV definitief dossier (mock)",
        formatHints: ["Keys, manuals, residual lists closed"],
        guidanceOnly: true,
        mockExamples: [
          "Sleuteloverdracht_protocol.pdf",
          "Handleidingen_gebouwenbeheerder.zip",
          "Restpunten_afgehandeld_overzicht.pdf",
        ],
      },
    ],
    "7": [
      {
        id: "modification",
        label: "Modification / retrofit recorded",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["modification_recorded"] },
      },
      {
        id: "retrofit_mock",
        label: "Typical retrofit / change-order pack (mock)",
        formatHints: ["Vergunning, bestekwijziging"],
        guidanceOnly: true,
        mockExamples: [
          "Stedenbouwkundige_vergunning_uitbreiding.pdf",
          "Addendum_bestek_dakisolatie.pdf",
          "As-built_na_renovatie.ifc",
        ],
      },
    ],
    "8": [
      {
        id: "transfer",
        label: "Property transferred",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["property_transferred"] },
      },
      {
        id: "transfer_mock",
        label: "Typical transfer / sale dossier (mock)",
        formatHints: ["Notaris, EPC, bodemattest"],
        guidanceOnly: true,
        mockExamples: [
          "EPC_attest_verkoop.pdf",
          "Bodemattest_notaris.pdf",
          "Erfgoed_inventaris_bijlage.pdf",
        ],
      },
    ],
    "9": [
      {
        id: "demolition",
        label: "Demolition / end-of-life inventory",
        formatHints: ["PID milestone"],
        match: { pidMilestoneKeys: ["demolition_inventory"] },
      },
      {
        id: "eol_mock",
        label: "Typical demolition / circularity dossier (mock)",
        formatHints: ["Sloopvergunning, afvalstromen, hergebruik"],
        guidanceOnly: true,
        mockExamples: [
          "Sloopvergunning_gemeente.pdf",
          "Afvalregister_materiaalstromen.xlsx",
          "Asbest_attest_sloop.pdf",
        ],
      },
    ],
  };
