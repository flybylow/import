# PID digitization — product plan & engineering alignment

This document ties the **Postinterventiedossier (PID)** digitization vision to **what `bimimport` already does** and proposes a **phased plan**. It is product and engineering guidance, not legal advice; verify Belgian regulatory claims with counsel.

## Goals

- Make the as-built record **structured, auditable, and queryable** (RDF-first, JSON-LD export path).
- Close the gap between **design/BIM**, **delivered products**, and **evidence** (EPD, leveringsbon, site reports).
- Reuse the existing **IFC → enriched TTL → KB → passports → calculate** pipeline where possible.

Related internal docs: `docs/bim-to-kg-journey.md`, `docs/sources-contract.md`, `docs/kg-expansion-sources-benelux-eu.md`, `docs/deliveries-importer-integration.md` (leveringsbon ingest, `data/` persistence, timeline).

---

## Conceptual tiers (product)

| Tier | Focus | Outcome |
|------|--------|---------|
| **1 — Essential** | Lastenboek / leveringsbon trace, EPD-linked technical data, BIM-derived geometry & materials, basic oplevering checklist | Auditable **material ↔ evidence** with pass/fail at element/product level |
| **2 — Regulatory trail** | Werfverslagen, change log, contractor certs, compliance report (rules + evidence chain), digital-first as-built attest workflow | **Provenance**: delivery → installation → rule → signature |
| **3 — Circular / EoL** | BOM per assembly, recyclability, dismantling hints | Demolition / renovation value (future ontology work) |

---

## What `bimimport` already provides

| Capability | Where |
|------------|--------|
| IFC import → enriched graph with **BaseQuantities**, **Pset_*Common** fields (`FireRating`, `ThermalTransmittance`, `IsExternal`, `LoadBearing`, …) | `src/lib/layer1-enrich.ts`, `data/*-enriched.ttl` |
| Versioned **EPD sources** (B-EPD, KBOB, ICE, epd-hub) + `config.json` order | `docs/sources-contract.md`, `config.json` |
| **KB** with materials ↔ EPD, manual overrides, coverage stats | `/kb`, `POST /api/kb`, `POST /api/kb/override` |
| **Element passports** (materials, EPD, quantities, `lcaReady`) | `GET /api/kb/status` (`elementPassports`), `/calculate`, `/bim` (Passports mode) |
| **Carbon calculation** with gate on placeholder / missing LCA | `POST /api/calculate`, `src/lib/kb-read-epd.ts` |
| **3D** | `/bim` Building (ThatOpen IFC) vs Passports (abstract boxes + panel) |

---

## Gaps to close for PID / compliance MVP

| Gap | Notes |
|-----|--------|
| **Normalized fire / reaction-to-fire from EPD** | B-EPD TTL must be profiled for fields; may need mapping from free text to `EI1 30` / Euroclass-style enums. |
| **KB Basisnormen (or subset) as executable rules** | Not in repo; needs legal/product ownership + test cases. Start with **hand-authored JSON rules** + unit tests, not full PDF automation. |
| **Leveringsbon → element** | OCR/intake is out of band; **linking model** must map delivery lines to `bim:element-*` / `globalId` / human labels. Schependomlaan naming is **project-specific**. |
| **Audit timeline events** | **Shipped:** `data/<projectId>-timeline.ttl`, `GET/POST /api/timeline`, `/timeline` (EPCIS, deliveries, manual notes, **MS Project schedule**, **BCF** imports). See [`docs/timeline-schedule-integration.md`](timeline-schedule-integration.md). |
| **Federated SPARQL (Comunica)** | **Not** a dependency today (`package.json`); federation is optional if we keep reasoning in TypeScript + `rdflib`. |
| **IFC ↔ same viewer as compliance heatmap** | Building view lacks expressId highlight tied to passport filters; Passports view is fast for **isolate / colour** prototypes. |

---

## Engineering roadmap (recommended)

### Phase A — **Compliance slice (2–4 weeks)**

**Objective:** One vertical: *element + IFC Pset signal + EPD signal + one rule → PASS/FAIL* (UI or API).

1. **Inventory**  
   - Sample B-EPD TTL for fire-related literals; document predicate paths or gaps.  
   - Document `ont:fireRating` / IFC strings currently in enriched TTL (often natural language, not `EI1 30`).

2. **Rule harness**  
   - Small **JSON/YAML rule file** (location class × required rating) + **pure functions** that take `{ element, materials[], epdNodes[] }` and return `{ status, reasons[] }`.  
   - No Comunica required for MVP.

3. **UI**  
   - Extend **Passports** or `/calculate` with a **“Compliance (pilot)”** section: counts + list of failing `expressId`s.  
   - Optional: colour **BimViewer3D** boxes by status (reuse `meshByExpressId` map).

**Exit criteria:** Demo on one project (e.g. example / Schependomlaan) with explicit **limitations** in the UI.

### Phase B — **Deliveries & provenance (4–8 weeks)**

**Objective:** Attach delivery records to KB elements and show **evidence chain** in UI.

1. Data model for **Delivery** / **Afleverbon** (Turtle or JSON-LD + stable IDs).  
2. API: `POST` delivery facts, `GET` by `projectId` / element.  
3. Link werfverslagen / photos later; **immutable append-only log** (see Phase C).

### Phase C — **Audit timeline (parallel or after B)**

**Objective:** Append-only **timeline events** (actor, action, `bim:` refs, confidence) in `data/<projectId>-timeline.ttl` or per-project files.

**Status (2026-04):** Core TTL + `/api/timeline` + `/timeline` UI are in place. Schedule ingest: `npm run import:schependomlaan-schedule`; BCF: `npm run import:schependomlaan-bcf`. Spec: [`docs/timeline-schedule-integration.md`](timeline-schedule-integration.md).

1. Align predicates with **`https://tabulas.eu/`** namespaces used elsewhere; avoid `pages/api` — use **`src/app/api/`**.  
2. If SPARQL is required, add **one** query dependency explicitly (e.g. Comunica) and CI; otherwise **query in TS** for MVP.

### Phase D — **Export & attest workflow**

JSON-LD (+ optional PDF) export, signature hooks — **after** A–C prove value; involves **legal/product** on eIDAS and notary formats.

---

## Open questions (for Jacky / data / legal)

Use this as a standing checklist; track answers in PRs or a short `docs/` addendum.

1. **B-EPD:** Share of records with machine-usable fire performance vs free text?  
2. **Rules:** Who signs off the first **5–10** simplified residential rules against KB Basisnormen text?  
3. **IFC vs site:** Default assumption when leveringsbon and IFC disagree — **block**, **warn**, or **architect override**?  
4. **Privacy:** Invoices — reference-only storage policy (align with brief: do not duplicate full invoices in-app).

---

## Success metrics (pilot)

- **Phase A:** ≥1 rule type evaluated for ≥100 elements; failing elements listed with **reason string**; reproducible on clean `npm run build:kb`.  
- **Phase B:** ≥1 real leveringsbon path linked to ≥1 element with **traceable** EPD + rule output.  
- **Phase C:** Event append + list-by-element without hand-editing Turtle.

---

## What we are not committing to in this doc

- Full automation of **KB Basisnormen** from PDF.  
- **Replacing** architect or notary sign-off without regulatory review.  
- **Comunica** or triplestore as mandatory stack decisions — **evaluate after** Phase A.

---

## Revision history

- 2026-04-03: Initial plan (product tiers + repo alignment + phased roadmap).
- 2026-04-03: Phase A pilot shipped in-app: **`/calculate` → Compliance (pilot)** (`src/lib/compliance-pilot.ts`, `ifcFireRating` on element passports). See **`docs/compliance-data-checklist.md`** for external data tasks.
