# PID reference lifecycle → audit timeline (main events)

**Purpose:** Stable **product vocabulary** for mapping the Belgian **construction / PID narrative** (Notion: “Phase 0–9”) to **`data/<projectId>-timeline.ttl`** — without confusing **reference lifecycle** phases with **engineering** naming (`phase 0` = IFC element groups JSON; technical pipeline Phase 1 = parsed TTL). See [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md) and [`docs/roadmap-milestones.md`](roadmap-milestones.md) §“Three lanes”.

**Full narrative + Tabulas capture moments:** [`docs/unified-construction-lifecycle-tabulas.md`](unified-construction-lifecycle-tabulas.md).

**Deep link (specification / saved fiche):** [`/deliveries?tab=specification&specificationFiche=1`](http://localhost:3000/deliveries?tab=specification&specificationFiche=1) — **design–spec capture**. Legacy URLs still work: `tab=bestek`, `bestekFiche=1`, and shorthand `tab=spec` / `flow` / `leveringsbon` / `lifecycle` (see `src/lib/deliveries-tabs.ts`). Timeline rows for that flow today are **`bestek_bindings_milestone`** (and related bestek/product events), not a separate “PID phase” type yet.

---

## 1. How we should wire this (engineering approach)

1. **Sort key stays `timeline:timestamp`** — every milestone uses the **document or business date** when known (same rule as leveringsbon / werfverslag).
2. **Prefer extending `timeline:eventAction`** only when we need **first-class UI filters**, **EPCIS-style facets**, or **stable SPARQL**. Until then, **`manual_note`** with a **machine-readable prefix** in `message` (e.g. `PID_PHASE:2 delivery`) is acceptable for pilots — but **do not** rely on free text long term.
3. **Recommended pattern for a “big section”:** add **one** umbrella action, e.g. **`pid_reference_milestone`**, plus **structured literals** on the event (same style as `timeline:epcis*` / `timeline:schedule*`): e.g. `timeline:pidLifecyclePhase` (`"0"`…`"9"`), `timeline:pidMilestoneKey` (`pid_opened`, `pv_voorlopig_signed`, …), optional `timeline:pidStateHint` for the narrative state machine (**not** a second source of truth — hints for UI only).
4. **Alternative:** multiple specific actions (`pid_opened`, `pid_finalized`, `pv_provisional_signed`, …) — simpler queries, longer vocab; add in [`src/lib/timeline-events-vocab.ts`](../src/lib/timeline-events-vocab.ts) + [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md) + append-event RDF in one PR.
5. **Deliveries / PID UI:** **Register PID milestone** posts to `POST /api/timeline` with `pid_reference_milestone` + `pidMilestoneKey`; deep link `?pidMilestone=…`. **Empty timeline:** **Append full PID template** (Deliveries → PID) or `POST /api/timeline/seed-pid-template` appends all allowlisted keys with synthetic spacing (`source=pid-template-seed`).
6. **Notion / external docs:** keep the rich narrative there; this file is the **repo contract** for “what becomes an `AuditEvent`”.

---

## 2. Main events — map today vs proposed

| Ref. phase | Short name | Document / moment (NL) | **Shipped today** (`eventAction` or stand-in) | **Proposed** (pick one strategy in §1) |
|------------|------------|-------------------------|-----------------------------------------------|----------------------------------------|
| 0 | Design / spec | Bestek, IFC, material matching | `bestek_bindings_milestone`, `model_imported`, pipeline events, `manual_note` for permit/EPB-start | `pid_reference_milestone` + `pidMilestoneKey=spec_baseline` **or** keep granular bestek + notes |
| 1 | PID opened | PID opening, contract, verzekeringsattest | `manual_note` | `pid_reference_milestone` + `pidMilestoneKey=pid_opened` |
| 2 | Site / delivery | Leveringsbon, werfverslag, EPCIS | `delivery_document_added`, `site_report_added`, `epcis_supply_chain_event`, `evidence_linked` | Same; add line-level link milestone when **M-Delivery-Element-Link** ships |
| 3 | Completion | As-built dossier, PID finalized | `manual_note`, `data_exported` | `pid_reference_milestone` + `pidMilestoneKey=pid_finalized` / `as_built_package_recorded` |
| 4 | Voorlopige oplevering | PV voorlopig | `manual_note` | `pid_reference_milestone` + `pidMilestoneKey=pv_provisional_signed` |
| 5 | Waarborg | Defect / repair | `manual_note` | `pid_reference_milestone` + `pidMilestoneKey=warranty_defect` / `warranty_repair` |
| 6 | Definitieve oplevering | PV definitief | `manual_note` | `pid_reference_milestone` + `pidMilestoneKey=pv_final_signed` |
| 7 | Living / retrofit | PID update, modification | `manual_note`, `delivery_document_added`, `evidence_linked` | `pid_reference_milestone` + `pidMilestoneKey=modification_recorded` |
| 8 | Transfer | Notaris / VIP | `manual_note`, `data_exported` | `pid_reference_milestone` + `pidMilestoneKey=property_transferred` |
| 9 | End of life | Sloopinventaris | `manual_note` | `pid_reference_milestone` + `pidMilestoneKey=demolition_inventory` |

**PID state machine** (OPENED → ACCUMULATING → …): **narrative only** in product docs until we explicitly model it; the audit log remains **append-only events**, not a mutable state table.

---

## 3. Overlapping timelines (product)

Align with Notion **“Overlapping timelines”**: architect, contractor, EPB, PID, safety, financial — each produces **events** that share one **`timeline.ttl`** sort order. Use **`timeline:source`** / `actorLabel` to distinguish channel (architect vs contractor vs EPB), not separate files per lane.

---

## 4. Related

- **Lifecycle view checklist:** [`src/lib/lifecycle-phase-document-expectations.ts`](../src/lib/lifecycle-phase-document-expectations.ts) — expected document/trace slots per phase (matched to `eventAction`, PID milestones, EPCIS); shown under **By phase** on `/timeline?view=lifecycle`.
- [`docs/unified-construction-lifecycle-tabulas.md`](unified-construction-lifecycle-tabulas.md) — stakeholder lifecycle (Phase 0–9) + Tabulas moments  
- [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md) — all current `eventAction` values  
- [`docs/pid-digitization-plan.md`](pid-digitization-plan.md) — tiers, gaps, engineering phases A–D  
- [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md) — document → action for leveringsbon / werfverslag  
- Notion page *Complete Lifecycle: Belgium Construction (Phase 0-9)* — stakeholder narrative; **this doc** is the implementation-facing index  

---

## Revision history

- **2026-04-07:** Initial main-events table and wiring strategy (reference lifecycle vs engineering naming).
