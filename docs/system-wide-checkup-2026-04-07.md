# System-wide checkup — 2026-04-07

This report summarizes a **read-through of `docs/`**, spot-checks of **core code paths**, and **automated tests** run in the repo. It answers whether **BIM loading**, **material traceability**, **phases**, **timeline events**, **PID**, and **deliveries** fit together coherently.

## Verdict

**The architecture is internally consistent.** The product deliberately separates three concerns (technical pipeline, append-only audit log, stakeholder reference lifecycle). Documentation in `docs/` matches what the code enforces: **timeline ordering** uses `timeline:timestamp`; **material identity** flows IFC → dictionary slug → EPD in `*-kb.ttl`; **BIM element identity** surfaces as **express id** (viewer/API) and **global id** (IFC) on passports. **PID and deliveries** integrate by **emitting the right `timeline:eventAction`** — not by silently inferring from files on disk.

Known gaps are **named in roadmap docs** (not hidden): e.g. **line-level leveringsbon → IFC element** is not automated yet.

---

## What was reviewed

- **Knowledge index:** `docs/BASE.md`, `docs/roadmap-milestones.md`, `docs/PRD-SUMMARY.md` (architecture pointer).
- **BIM → carbon:** `docs/bim-to-kg-journey.md`, `docs/reset-and-clean.md` (artifact list).
- **Timeline & documents:** `docs/timeline-first-and-document-matching.md`, `docs/timeline-event-taxonomy.md`, `docs/pid-lifecycle-timeline-events.md`, `docs/deliveries-importer-integration.md`, `docs/deliveries-pid-tab-subdivisions.md`.
- **Stakeholder lifecycle:** `docs/unified-construction-lifecycle-tabulas.md`, `docs/pid-digitization-plan.md` (tiers and gaps).
- **Sample on-disk data:** `data/<projectId>-timeline.ttl` (PID template seed + structured `pidMilestoneKey` / `pidLifecyclePhase`).

---

## Tests executed (all passed)

Commands run on 2026-04-07:

| Script | Focus |
|--------|--------|
| `npm run test:timeline-events` | Parse/sort TTL, document storage fields |
| `npm run test:timeline-document-matching` | Document kinds ↔ `eventAction` ↔ vocab sync |
| `npm run test:timeline-delete-events` | Round-trip / delete by id |
| `npm run test:timeline-pid-milestones` | PID template payloads, allowlist, TTL |
| `npm run test:pid-dossier` | Dossier ordering vs milestones |
| `npm run test:deliveries-tabs` | Canonical `?tab=` and fiche deep links |
| `npm run test:workflow-readiness` | Readiness rows vs core pipeline files |
| `npm run test:timeline-inspect-links` | Deep links for inspect |
| `npm run test:timeline-lifecycle-overview` | Lifecycle matrix, phases, deliveries bucket |
| `npm run test:timeline-actor-lanes` | Actor display lanes |
| `npm run test:lifecycle-phase-document-expectations` | Phase 0–9 checklist vs events |
| `npm run test:ifc-type-material-defaults` | Bestek auto-match partitions (e.g. `IfcCovering`) |
| `npm run test:material-labels` | NL labels vs `material-dictionary.json` |

**Typecheck:** `npx tsc --noEmit` — **passes**.

**Lint:** `npm run lint` — **fails** with multiple `react-hooks/set-state-in-effect` (and related) findings across BIM/timeline/viewer components. This is **style/rule debt**, not evidence that timeline or KB logic is wrong; treat as follow-up for CI policy or refactors.

---

## Coherence checklist

| Question | Answer |
|----------|--------|
| Does the timeline define “what happened when”? | **Yes.** Single sort key: `timeline:timestamp` on `timeline:AuditEvent` in `data/<projectId>-timeline.ttl`. |
| Do pipeline steps automatically create audit rows? | **Partially.** Ingest and APIs that call the timeline writer do; **merely saving** JSON/TTL under `data/` without the matching event does **not** (by design — see `docs/timeline-first-and-document-matching.md`). |
| How do materials connect to carbon? | **IFC materials** → Phase 2 translate → **`material_slug` / EPD nodes** in `*-kb.ttl` → Phase 3 reads quantities + GWP per EPD. |
| How does the UI show “this wall’s materials”? | **`GET /api/kb/status`** `elementPassports`: `expressId`, `globalId`, layered materials with `epdSlug`, LCA readiness. |
| How do PID milestones relate to engineering “phase 0”? | **Different concepts.** Engineering **phase 0** in this repo often means **phase-0 element groups JSON** / spec capture; Belgian **reference phase 0–9** is the PID narrative. Docs explicitly warn against conflating them (`docs/pid-lifecycle-timeline-events.md`, `docs/workflow-readiness.md`). |
| Do deliveries and PID share one log? | **Yes.** Same `timeline:eventAction` vocabulary (`src/lib/timeline-events-vocab.ts`): e.g. `delivery_document_added`, `bestek_bindings_milestone`, `pid_reference_milestone`, `document_original_stored`. |
| Is leveringsbon content queryable per IFC element? | **Not yet as first-class automation** — milestone **M-Delivery-Element-Link** in `docs/roadmap-milestones.md`; use manual `evidence_linked` / `targetExpressId` until then. |

---

## Risks and rough edges (documented, not surprises)

1. **Reset scope:** `clean:pipeline` / reset flows may not remove **timeline** or **deliveries** appends; `docs/deliveries-importer-integration.md` notes this explicitly.
2. **Optional `*-translated.ttl`:** Dynamic runs may skip a separate translate artifact; material→EPD for passports/calculate is anchored on **`-kb.ttl`** (`docs/BASE.md`).
3. **ESLint vs patterns:** URL-driven UI sync in large client components triggers strict hooks rules; worth a dedicated cleanup or rule tuning if CI should enforce lint.

---

## Related deep dives

- **End-to-end BIM → material → timeline + PID narrative:** [`docs/data-flow-bim-materials-timeline-pid.md`](data-flow-bim-materials-timeline-pid.md) (companion to this report).

---

## Revision history

- **2026-04-07:** Initial system-wide checkup after doc review + test battery + `tsc` / `eslint` status.
