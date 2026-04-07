# Unified construction lifecycle (Tabulas)

**Purpose:** Stakeholder-facing map of the Belgian **construction / PID (postinterventiedossier)** journey from design through demolition, aligned with **Tabulas** data capture: *every document is an event; every event is a data capture opportunity.*

**Disclaimer:** This is product and process documentation, **not legal advice**. Verify regulatory obligations with qualified counsel.

**Naming:** Belgian **process Phase 0–9** (this document) is **not** the same as **engineering “phase 0”** in this repo (IFC element-groups JSON under `data/<projectId>-phase0-element-groups.json`). See [`docs/pid-lifecycle-timeline-events.md`](pid-lifecycle-timeline-events.md).

**Implementation index:** How these phases map to `timeline:eventAction` and proposed `pid_reference_milestone` keys → [`docs/pid-lifecycle-timeline-events.md`](pid-lifecycle-timeline-events.md). **In-app:** Deliveries → **PID** tab (`/deliveries?tab=pid`), audit log → **`/timeline`**.

---

## Timeline overview

The lifecycle runs from **permit / specification (Phase 0)** through **demolition (Phase 9)**. The **PID** is the spine: opened in Phase 1, filled during construction (Phase 2), finalized in Phase 3, and transferred in Phase 8.

---

## Phase 0: Permit and specification

**Actors:** Bouwheer, architect, studiebureau, EPB-verslaggever.

**Documents (examples):** Omgevingsvergunning; **bestek / lastenboek**; ontwerpplannen; stabiliteitsstudie; EPB-startverklaring.

**Tabulas moments:** First structured material/spec baseline: IFC element groups, map groups to bestek articles → outputs such as `*-bestek-material-matching.json` and timeline events (e.g. bestek save milestones). See Deliveries → **Specification** and **Ingest** tabs.

---

## Phase 1: Contractor selection and PID opening

**Documents:** Aannemingsovereenkomst; verzekeringsattest; veiligheidscoördinatieplan; **PID opening**.

**PID state:** Not opened → **OPENED** (empty, ready to accumulate).

**Tabulas:** Project/timeline registration; optional `pid_reference_milestone` with key `pid_opened`.

---

## Phase 2: Construction and material delivery (core capture)

**Recurring documents:** Werfverslag; vorderingsstaat; **leveringsbon**; technische fiche / EPD; change orders; photos (hidden work).

**Rhythm:** Delivery → installation → inspection → werfverslag.

**PID state:** **ACCUMULATING**.

**Tabulas (today):** Leveringsbon ingest → `delivery_document_added`; site reports → `site_report_added`; EPCIS → `epcis_supply_chain_event`; bestek/product coupling → dedicated actions. **Future:** structured material-event records ([`docs/material-event-schema.md`](material-event-schema.md)).

---

## Phase 3: Completion

**Documents:** As-built attest; as-built dossier; as-built EPB; EPB-aangifte; **PID finalized**; einde der werken.

**PID state:** **FINALIZED**.

**Tabulas:** Graph export / `data_exported`; milestones `as_built_package_recorded`, `pid_finalized`.

---

## Phase 4: Voorlopige oplevering

**Documents:** Werkopleveringsrapport; **PV voorlopige oplevering**.

**Tabulas:** Acceptance snapshot; milestone `pv_provisional_signed`.

---

## Phase 5: Waarborgtermijn

**Documents:** Defect reports; repair confirmations.

**PID state:** **LIVE** (in use, defects tracked).

**Tabulas:** `warranty_defect`, `warranty_repair` milestones (or `manual_note` until logged).

---

## Phase 6: Definitieve oplevering

**Documents:** **PV definitieve oplevering** (10-year liability context).

**PID state:** **WARRANTIED**.

**Tabulas:** Milestone `pv_final_signed`.

---

## Phase 7: Living phase (modifications)

**Documents:** PID updates; new technical sheets; alteration records.

**PID state:** **EVOLVING**.

**Tabulas:** `modification_recorded`; deliveries/evidence events as needed.

---

## Phase 8: Sale or transfer

**Documents:** PID package; EPC; asbestattest; VIP dossier; notarial deed.

**PID state:** **TRANSFERRED**.

**Tabulas:** Milestone `property_transferred`; exports for handover.

---

## Phase 9: End of life

**Documents:** Sloopinventaris; asbestinventaris; residual value / circularity assessments.

**PID state:** **ARCHIVED** (building gone; record preserved).

**Tabulas:** Milestone `demolition_inventory`; long-term link to circular economy datasets (e.g. TOTEM / B-EPD) as product matures.

---

## PID state machine (narrative)

```
Design (Phase 0)
  → OPENED (Phase 1)
  → ACCUMULATING (Phase 2)
  → FINALIZED (Phase 3)
  → verified at PV voorlopig (Phase 4)
  → LIVE (Phase 5)
  → WARRANTIED (Phase 6)
  → EVOLVING (Phase 7)
  → TRANSFERRED (Phase 8)
  → ARCHIVED (Phase 9)
```

The audit timeline is **append-only**; these states are **hints** for UI and reporting, not a separate mutable state table. See [`docs/pid-lifecycle-timeline-events.md`](pid-lifecycle-timeline-events.md).

---

## Tabulas capture by phase (summary)

| Phase | Focus | Typical outputs |
|------|--------|-----------------|
| 0 | Spec + IFC + bestek binding | Matching JSON, bestek bindings, timeline |
| 1 | Contracts + PID open | `pid_opened` milestone |
| 2 | Deliveries + site evidence | `delivery_document_added`, `site_report_added`, EPD enrichment |
| 3 | As-built + PID close | `pid_finalized`, exports |
| 4–6 | Handover + warranty | PV / warranty milestones |
| 7+ | Changes + transfer + EoL | `modification_recorded`, `property_transferred`, `demolition_inventory` |

---

## Overlapping timelines

Several rhythms run in parallel (architect, contractor, EPB, PID, safety, financial). They should appear as **one ordered audit stream** via `timeline:timestamp` and provenance (`timeline:source` / actor). See [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md).

---

## Related docs

- [`docs/pid-lifecycle-timeline-events.md`](pid-lifecycle-timeline-events.md) — event vocabulary mapping  
- [`docs/material-event-schema.md`](material-event-schema.md) — planned structured material-event JSON (Phase 2 depth)  
- [`docs/pid-digitization-plan.md`](pid-digitization-plan.md) — product tiers and engineering alignment  
- [`docs/roadmap-milestones.md`](roadmap-milestones.md) — shipped vs next  
- [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md) — all `eventAction` values  

---

## Revision history

- **2026-04-07:** Initial unified lifecycle doc for Tabulas (condensed from stakeholder brief; cross-linked from repo index).
