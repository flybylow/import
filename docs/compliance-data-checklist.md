# Compliance MVP — data checklist (for data / backend / legal)

Use this as a living **yes/no** inventory. Answers belong in PRs or issue comments; update this file when a box is settled.

## B-EPD & product data

- [ ] **Fire / reaction-to-fire in B-EPD TTL** — Predicates or literals are documented; sample queries recorded.
- [ ] **Population rate** — Rough % of products with usable fire fields (by category: doors, insulation, masonry, …).
- [ ] **Normalization** — Plan to map free text → comparable tokens (`EI1 30`, Euroclasses, …).

## Rules (KB Basisnormen or successor)

- [ ] **Source text** — Official reference PDF/version locked for the MVP scope.
- [ ] **MVP rule subset** — 5–10 rules signed off (residential or chosen typology) — not legal advice until counsel reviews.
- [ ] **Owner** — Who maintains the rule JSON when regulations change?

## BIM ↔ site reality

- [ ] **IFC naming** — How `bim:element-*` / `globalId` / display names map to werfverslagen / leveringsbon lines (per pilot project).
- [ ] **Design vs delivered** — Policy when IFC and delivery disagree (block / warn / architect override).

## Pipeline (bimimport)

- [ ] **`ont:fireRating` on elements** — Confirmed in enriched + KB for pilot IFCs (`layer1-enrich` / KB build).
- [ ] **Passport field** — `ifcFireRating` exposed on `GET /api/kb/status` element passports.
- [ ] **Compliance pilot UI** — `/calculate` → **Compliance (pilot)** section lists pass/warn/fail (see `src/lib/compliance-pilot.ts`).

## Optional / later

- [ ] **Comunica** (or other SPARQL) — Only if cross-graph queries justify the dependency.
- [ ] **Append-only timeline** — `data/*-timeline.ttl` + API (see `docs/pid-digitization-plan.md` Phase C).

## Related

- `docs/pid-digitization-plan.md` — Roadmap and tiers.
- `src/lib/compliance-pilot.ts` — Pilot rule logic (EPD coverage + LCA readiness + IFC fire hint).
