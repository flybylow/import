# Compliance run events (Turtle)

Each **Record run to TTL** on **Phase 3 – Calculate** appends one resource to:

`data/<projectId>-compliance-events.ttl`

## Vocabulary

- Namespace: `https://tabulas.eu/compliance#` (`compliance:`)
- Class: `compliance:ComplianceRun`
- Rules applied (stable ids, same order as the pilot): `epd_link_required`, `lca_ready`, `ifc_fire_rating`

## Results blank node

- `compliance:total`, `compliance:pass`, `compliance:warn`, `compliance:fail` — element-level counts
- `compliance:failingElementExpressIds` — RDF list of `expressId` where overall status is **fail**
- `compliance:warningElementExpressIds` — same for **warn** (e.g. IFC fire stated but EPD gap)

So a row with only **warn** appears under `warningElementExpressIds`, not `failingElementExpressIds`.

## API

- `POST /api/compliance-run` with JSON body: `{ projectId, summary, sourceData?, actorLabel?, actorSystem? }`
- `summary` is the full `CompliancePilotSummary` from `src/lib/compliance-pilot.ts` (includes `results[]`).

## After a fail / warn

On **Phase 3 — Calculate**, each failing element shows **What this means** and **Fix it** links:

- **Phase 2 — jump to material** — `/kb?projectId=…&focusMaterialId=<id>` (unmatched table when the material has no EPD).
- **Sources** — TTL snapshots / order for B-EPD, KBOB, ICE.
- **BIM — passports** — `/bim?projectId=…&view=passports&expressId=…` to inspect the element.

Underlying fields on each result: `missingEpdMaterials[]`, `lcaBlockedMaterials[]` (`src/lib/compliance-pilot.ts`).

## Related

- `src/lib/compliance-run-turtle.ts` — serialization
- `src/app/api/compliance-run/route.ts` — append-only writer
