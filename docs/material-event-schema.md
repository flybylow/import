# Material event schema (planned)

**Status:** Specification only — not yet persisted as a first-class artifact in `data/`. See [`docs/unified-construction-lifecycle-tabulas.md`](unified-construction-lifecycle-tabulas.md) Phase 2 (construction / delivery).

**Goal:** Represent a **single installed or delivered material episode** with stable ids, without stuffing unbounded JSON into `timeline:message`.

## Proposed JSON shape (v0 draft)

```json
{
  "material_event_id": "uuid",
  "project_id": "string",
  "leveringsbon_id": "LB_2026_03_001",
  "product_name": "Rockwool Frontrock Max",
  "supplier": "Bouwmaterialen De Boeck",
  "quantity_value": 48,
  "quantity_unit": "m²",
  "batch_number": "RW-2026-03-4521",
  "delivery_date": "2026-03-15",
  "installed_date": "2026-03-18",
  "ifc_global_id": "3nGgNTrF94iRpWcRjXvXvA",
  "epd_match": {
    "product": "Rockwool Frontrock Max",
    "database": "Oekobaudat",
    "gwp_a1_a3_kg_co2e_per_m2": 0.158
  },
  "approval_status": "approved",
  "werfverslag_date": "2026-03-19",
  "photo_refs": ["photo_001.jpg", "photo_002.jpg"]
}
```

## Storage options (later)

| Option | Pros | Cons |
|--------|------|------|
| `data/<projectId>-material-events.json` array | Simple, diff-friendly | Not queryable in SPARQL |
| Rows in `*-deliveries.ttl` linked to `timeline:AuditEvent` | One graph | Requires predicate design + migration |
| Separate `*-material-events.ttl` | Clear boundary | Another file to ship |

## Links to current product

- Timeline: `delivery_document_added`, `site_report_added`, `evidence_linked` — use **business dates** in `timeline:timestamp` ([`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md)).
- Deliveries ingest: [`POST /api/deliveries/ingest`](../src/app/api/deliveries/ingest/route.ts).
- Matching helpers: [`src/lib/timeline-document-matching.ts`](../src/lib/timeline-document-matching.ts).

## Revision history

- **2026-04-07:** Initial draft (plan B4).
