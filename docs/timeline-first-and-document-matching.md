# Timeline-first ordering and document → timeline matching

**Purpose:** One place for **how we layer** technical work, spec/deliveries artifacts, and **audit evidence** so nothing contradicts the append-only log. The **timeline is the sort key** for “what happened when” in the product UI (`/timeline`) and in `data/<projectId>-timeline.ttl`.

**Code:** [`src/lib/timeline-document-matching.ts`](../src/lib/timeline-document-matching.ts) — stable map from document kinds to `timeline:eventAction` (and typical `timeline:source`). **Tests:** `npm run test:timeline-document-matching`.

## Events system: documents → timeline

**Integrating documents into the audit story** happens only by **appending timeline events** with the correct `timeline:eventAction`. Saving a file under `data/` (bestek bindings, deliveries Turtle, …) **does not** by itself change what appears on `/timeline` unless the ingest or API path **also** writes the matching audit row (e.g. `bestek_bindings_milestone`, `delivery_document_added`). **PID milestones** (`pid_reference_milestone`) and **document events** share the **same** append-only log and sort key (`timeline:timestamp`), so the timeline is **adjusted** in one place: the events vocabulary ([`src/lib/timeline-events-vocab.ts`](../src/lib/timeline-events-vocab.ts)) plus `data/<projectId>-timeline.ttl`.

See §2 for the document → `eventAction` table and §3 for ingest entry points.

---

## 1. Three lanes (roadmap) vs dashboard checklist

We use **three conceptual lanes** everywhere we explain the product ([`docs/roadmap-milestones.md`](roadmap-milestones.md) §“Three lanes”):

| Lane | Question it answers | Primary artifacts / UI |
|------|---------------------|-------------------------|
| **Technical pipeline** | Is the BIM → graph → KB → carbon chain complete? | `data/<projectId>.ifc`, `*-parsed/enriched/kb*.ttl`, `*-calc-latest.json`; `/pipeline`, `/workflow` technical rows |
| **Audit timeline** | What **events** happened, in **time order**, with provenance? | `data/<projectId>-timeline.ttl`, `/timeline` |
| **Reference lifecycle** | What does the **Belgian construction process** look like for stakeholders? | Narrative docs: [`docs/unified-construction-lifecycle-tabulas.md`](unified-construction-lifecycle-tabulas.md), dataset briefs; **not** stored as a PID state machine in code |

The **Dashboard** readiness table ([`docs/workflow-readiness.md`](workflow-readiness.md)) **splits** the second and third concerns into more rows: **audit timeline**, **spec & deliveries package** (`bestek` lane id), **compliance & planning**, **reference** sidecar. That is **UI grouping only**. **Authoritative ordering of evidence** is always **`timeline:timestamp`** on each `timeline:AuditEvent`, not the order of checklist rows.

**Rule:** If two things must be comparable in time (delivery vs site visit vs EPCIS receiving), they **must** appear as timeline events (or be sortable via the same timestamp field in a future ingest). Do not infer order from pipeline step numbers alone.

---

## 2. Document → timeline matching (leveringsbon, werfverslag, …)

Stakeholder language (NL/BE) maps to **controlled** `timeline:eventAction` literals (full list: [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md)).

| Document / moment (NL) | `eventAction` | Typical `source` | Companion data (optional) |
|-------------------------|---------------|------------------|---------------------------|
| **Leveringsbon** / **Afleverbon** | `delivery_document_added` | `deliveries-ingest` | Append `*-deliveries.ttl` when `appendDeliveriesTurtle` |
| **Werfverslag** / **Bouwverslag** / **Rapport werfbezoek** | `site_report_added` | `form` (today) | Message body + optional `targetExpressId` / `materialReference` via [`POST /api/timeline`](../src/app/api/timeline/route.ts) |
| **Technische fiche** linked to an element | `evidence_linked` | `form` | — |
| **Bestek** “Save bindings” milestone | `bestek_bindings_milestone` | `deliveries-bestek` | `*-bestek-bindings.json`, phase-0 groups JSON — UI: **`/deliveries?tab=specification`** (legacy `tab=bestek`) |
| **Stored original** (invoice, site photo, scan, …) | `document_original_stored` | `deliveries-document-upload` | `data/<projectId>-documents/<eventId>/…` — UI: **`/deliveries?tab=pid`** → **Send to project timeline** → **Custom trace / sign-off** → **Upload** |

EPCIS supply-chain events remain **`epcis_supply_chain_event`** with `eventTime` driving the same sort order as other audit rows ([`docs/timeline-epcis-integration.md`](timeline-epcis-integration.md)).

**Ordering relative to each other:** Use **business time** in `timeline:timestamp` (ISO 8601). Example: leveringsbon **delivery date** should set the audit timestamp when known, so a later **werfverslag** visit sorts **after** the delivery in `/timeline`. Ingest paths should prefer document dates over “ingest time” when the payload includes a reliable date (see leveringsbon ingest).

**Not implemented yet (milestones):** Normalized **line-level** link from a leveringsbon row → `bim:element-*` / `globalId` / `expressId` is **M-Delivery-Element-Link** ([`docs/roadmap-milestones.md`](roadmap-milestones.md)). Until then, use **`evidence_linked`** or **`manual_note`** plus optional `targetExpressId` to record manual links, and keep the structured lines in `*-deliveries.ttl`.

---

## 3. Where to wire ingest

- **Leveringsbon:** [`POST /api/deliveries/ingest`](../src/app/api/deliveries/ingest/route.ts) with `projectId`, `recordTimelineEvent`, `appendDeliveriesTurtle` — see [`docs/deliveries-importer-integration.md`](deliveries-importer-integration.md).
- **Werfverslag:** **`POST /api/timeline`** with `eventAction: "site_report_added"` (and optional `timestampIso` for back-dating to report date).
- **Stored originals (PDF, images, …):** **`POST /api/timeline/document-upload`** (multipart `projectId` + `file`) — appends **`document_original_stored`** with RDF storage fields (`timeline:documentStoredRelPath`, …).
- **Vocabulary edits:** add actions in [`src/lib/timeline-events-vocab.ts`](../src/lib/timeline-events-vocab.ts) first, then taxonomy doc, then this table and `TIMELINE_DOCUMENT_MATCHES`.

---

## Related

- [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md) — all `eventAction` values and EPCIS rules  
- [`docs/unified-construction-lifecycle-tabulas.md`](unified-construction-lifecycle-tabulas.md) — unified stakeholder lifecycle (Phase 0–9) + capture moments  
- [`docs/pid-lifecycle-timeline-events.md`](pid-lifecycle-timeline-events.md) — PID **reference** lifecycle → timeline `eventAction` / `pidMilestoneKey` map  
- [`docs/workflow-readiness.md`](workflow-readiness.md) — dashboard lanes vs this doc  
- [`docs/pid-digitization-plan.md`](pid-digitization-plan.md) — tiers and **Leveringsbon → element** gap  

---

## Revision history

- **2026-04-07:** **`document_original_stored`** + `POST /api/timeline/document-upload` — store bytes under `data/<projectId>-documents/<eventId>/` as the origin audit event alongside references.
- **2026-04-07:** §“Events system: documents → timeline” — documents join the log via the same `eventAction` vocabulary as PID milestones; files alone do not reorder the timeline.
- **2026-04-07:** Initial doc + `timeline-document-matching.ts` module; timeline timestamp from leveringsbon date when parseable.
