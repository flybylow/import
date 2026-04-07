# Workflow traceability readiness

**UI:** `/workflow?step=dashboard` (main nav **Dashboard**; on the workflow page use **3 · Dashboard** or **Go to dashboard**) — [`src/app/workflow/page.tsx`](src/app/workflow/page.tsx). **Traceability readiness** is a **checklist grouped into rows** from on-disk artifacts under `data/<projectId>-*`.

**API:** `GET /api/workflow/readiness?projectId=<id>` — same `projectId` rules as other data routes (`isSafeProjectId`: alphanumeric, hyphen, underscore, max length 80).

**Code:** [`src/lib/workflow-readiness.ts`](src/lib/workflow-readiness.ts), [`src/app/api/workflow/readiness/route.ts`](src/app/api/workflow/readiness/route.ts), [`src/components/WorkflowReadinessPanel.tsx`](src/components/WorkflowReadinessPanel.tsx).

**Tests:** `npm run test:workflow-readiness`, `npm run test:timeline-document-matching`

**Timeline-first:** Evidence that must be ordered in time (leveringsbon vs werfbezoek vs EPCIS) is merged in **`/timeline`** by `timeline:timestamp`. The dashboard does **not** define order; see [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md).

---

## Lanes (dashboard row groups vs roadmap “three lanes”)

The roadmap uses **three conceptual lanes** — technical pipeline, audit timeline, reference lifecycle — in [`docs/roadmap-milestones.md`](roadmap-milestones.md). The readiness table **maps** to those ideas but **splits** some into extra columns for checklist UX:

| Readiness `lane` id | Meaning | Roadmap lane |
|---------------------|---------|----------------|
| `technical` | IFC → parse TTL → enriched → KB → calc JSON (same chain as dynamic run). | Technical pipeline |
| `audit` | `data/<projectId>-timeline.ttl` exists and contains `timeline:AuditEvent` blocks. Events may come from EPCIS ingest, deliveries, MS Project, BCF, bestek saves, manual notes, compliance, etc. | **Audit timeline** (authoritative time ordering) |
| `bestek` | Optional JSON/TTL for Deliveries / bestek: **engineering “phase 0”** = IFC element groups JSON (`*-phase0-element-groups.json`), bindings, material matching, deliveries RDF, product coupling — **not** Belgian construction “phase 0” in stakeholder docs. | Feeds timeline events + parallel files; ordering still **timeline** |
| `compliance` | Optional `*-compliance-events.ttl`, `*-schedule-links.json`. | Technical + planning hints; compliance events may also append timeline |
| `reference` | Sidecar-only: PDFs, external links, project notes. | Reference lifecycle |

Do not confuse this checklist with the **technical** journey in [`docs/bim-to-kg-journey.md`](bim-to-kg-journey.md) or the **full PID roadmap** in [`docs/roadmap-milestones.md`](roadmap-milestones.md). Do not confuse **engineering phase 0** (element groups JSON) with **process-phase** narratives in stakeholder materials.

---

## Timeline events (EPCIS and others)

All `timeline:eventAction` values and EPCIS mapping are documented in:

- [`docs/timeline-event-taxonomy.md`](timeline-event-taxonomy.md) — full action list, lanes, EPCIS `type` / `bizStep` inventory.
- [`docs/timeline-epcis-integration.md`](timeline-epcis-integration.md) — ingest API and RDF predicates for EPCIS.

The readiness panel **does not** list each action type; it only counts `AuditEvent` rows and points to the taxonomy doc.

---

## Sidecar: `data/<projectId>-workflow-readiness-sidecar.json`

Optional **per-project** JSON next to other `data/<projectId>-*` artifacts. Keeps custom checklist rows in the same folder “package” as the rest of the project data.

**Schema (version 1):**

```json
{
  "version": 1,
  "notes": "Optional paragraph shown above the readiness table.",
  "extraRows": [
    {
      "id": "lastenboek-pdf",
      "lane": "reference",
      "label": "Lastenboek PDF archived",
      "detail": "Stored under docs/DataSetArch/…",
      "status": "done",
      "href": "https://example.com",
      "artifactPath": "docs/DataSetArch/spec.pdf"
    }
  ]
}
```

**Fields:**

- `version` — optional; reserved for future breaking changes.
- `notes` — optional string; shown in the dashboard panel.
- `extraRows` — optional array. Each item:
  - `id` — required stable string (stored as `sidecar-<id>` internally).
  - `lane` — one of: `technical`, `audit`, `bestek`, `compliance`, `reference`.
  - `label` — required short title.
  - `detail` — optional subtitle.
  - `status` — one of: `done`, `partial`, `missing`, `optional` (explicit; **not** inferred from disk).
  - `href` — optional URL or in-app path (`/…`).
  - `artifactPath` — optional display-only path string.

Invalid entries (wrong `lane` / `status`, empty `id` or `label`) are skipped silently.

---

## Response shape (API)

JSON includes:

- `rows` — merged default rows + validated `extraRows`.
- `timelineAuditEventCount` — parse of `*-timeline.ttl` (count of `a timeline:AuditEvent`).
- `sidecarPath`, `sidecarLoaded`, `sidecarNotes`.
- `laneLabels`, `docPaths` — pointers to this file and taxonomy.

---

## Related

- [`docs/timeline-first-and-document-matching.md`](timeline-first-and-document-matching.md) — leveringsbon / werfverslag → `eventAction`, timestamps.
- [`docs/roadmap-milestones.md`](roadmap-milestones.md) — product milestones.
- [`docs/pid-digitization-plan.md`](pid-digitization-plan.md) — PID tiers and gaps.
