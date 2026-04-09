# Deliveries importer — persistence & deeper docs

## There is no SQL “database” in this repo today

`bimimport` stores project state as **files under `data/`**: IFC uploads, Phase 1–3 Turtle/JSON, and **append-only audit graphs** (timeline, compliance runs, etc.). Matching logic reads **`src/data/material-dictionary.json`** and optional **source TTL** snapshots per **`docs/sources-contract.md`**.

### Deliveries UI — `?tab=` (canonical)

| `tab=` | Purpose |
|--------|---------|
| `ingest` (default when omitted) | Leveringsbon JSON → dictionary match → Turtle; optional timeline + deliveries TTL |
| `specification` | IFC groups, bestek/opmeting bindings, contractor coupling, saved fiche preview |
| `pid` | PID reference milestones + template seed |

**Legacy aliases** (still accepted): `tab=bestek` → specification; `tab=flow` / `leveringsbon` / `delivery` / `deliveries` → ingest; `tab=lifecycle` / `process` → pid. **`specificationFiche=1`** opens the saved opmeting fiche expanded; **`bestekFiche=1`** is the same (deprecated name). With **`tab=ingest`**, **`ingestPreview=1`** opens the **Live preview (JSON)** collapsible on load; without it, that section starts collapsed.

Example: `/deliveries?tab=ingest&projectId=…&ingestPreview=1`

If you need a **real RDBMS** (Postgres, etc.), treat this app as the **edge ingest service**: same JSON contract → your service writes rows → you can still POST Turtle or events back here, or replace file append with DB-backed implementations behind the same API shape.

---

## Wiring deliveries to “the real store” (what we support now)

### 1. Optional `projectId` on `POST /api/deliveries/ingest`

The request body may include, **alongside** the leveringsbon fields:

| Field | Type | Effect |
|-------|------|--------|
| `projectId` | string | Must satisfy `isSafeProjectId` (`^[-a-zA-Z0-9_]{1,80}$`). |
| `recordTimelineEvent` | boolean | When `true`, appends a **`delivery_document_added`** audit event to **`data/<projectId>-timeline.ttl`** (same mechanism as `POST /api/timeline`). **`timestampIso`** on that event uses the leveringsbon **`date`** field when it parses as a real date; otherwise ingest time. See [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md). |
| `appendDeliveriesTurtle` | boolean | When `true`, appends the response **`turtle`** block to **`data/<projectId>-deliveries.ttl`** (append-only; each run prefixed with an ISO comment). |

If `projectId` is missing or invalid, ingest still returns **200** with `matches` / `turtle` / `summary`; persistence flags are ignored.

The JSON response may include **`persistence`**: `{ projectId, timeline?: { eventId, path }, deliveriesTtl?: { path } }` when a write succeeded. **`projectId`** echoes the id used on disk so UIs can deep-link to **`/timeline?projectId=…`** reliably.

### 2. Timeline UI

Open **`/timeline?projectId=…`** to see **`delivery_document_added`** events next to manual notes and EPCIS ingest.

### 3. Knowledge base & “real” GWP (Phase 2)

MVP deliveries use optional **`gwpKgCo2ePerTonne`** on dictionary rows. For **source-backed LCA** (KBOB/ICE/…), align with:

- **`docs/kg-dictionary-source-hydration.md`** — dictionary routes; GWP/density from source TTL.
- **`docs/sources-contract.md`** — snapshot layout and `config.json`.
- **`docs/trace-table-for-dictionary.md`** — tracing dictionary decisions.

### 4. PID / leveringsbon ↔ BIM (product)

Roadmap, gaps, and **linking delivery lines to IFC elements** (not implemented as automation yet):

- **`docs/pid-digitization-plan.md`** — tiers, audit trail, **Leveringsbon → element** as a linking problem.
- **`docs/timeline-first-and-document-matching.md`** — leveringsbon vs **werfverslag** on the timeline, controlled `eventAction` map (`src/lib/timeline-document-matching.ts`).

### 5. Supply chain events (parallel path)

GS1-style events use a different endpoint but the same timeline file:

- **`docs/timeline-epcis-integration.md`** — `POST /api/timeline/epcis`.

### 6. End-to-end mental model

- **`docs/bim-to-kg-journey.md`** — IFC → KG → calculate.

---

## Files touched by persistence

| Artifact | Path |
|----------|------|
| Timeline (optional) | `data/<projectId>-timeline.ttl` |
| Deliveries RDF append (optional) | `data/<projectId>-deliveries.ttl` |

These are **not** removed by **`cleanPipelineArtifacts`** today; add them there if you want “reset project” to wipe delivery appends too.
