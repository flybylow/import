# Triple “completeness” — what we’re actually missing

“**100% complete**” only makes sense once you fix the **definition**. This doc separates:

1. **Schema** — which predicates the app knows how to read/write today.  
2. **Coverage** — how many **instances** in *your* project graph actually have those triples.  
3. **Semantic depth** — LCA details many EPDs publish but **we do not model yet** (not a missing *source* so much as missing *ontology + UI*).

---

## 1. What “complete” might mean (pick one)

| Goal | What “complete” means | Main gap today |
|------|------------------------|----------------|
| **A. Every IFC material linked to some EPD node** | All `bim:material-*` have `ont:hasEPD` | **Matcher + dictionary + sources** — unmatched materials (Phase 2). |
| **B. Every linked EPD usable in Phase 3 calculate** | `bim:epd-*` has real **`ont:gwpPerUnit`** + compatible **`ont:declaredUnit`**, and **`ont:epdDataProvenance`** is not routing-only | **Source hydration** or **manual** rows; `dictionary-no-lca-data` blocks calc (`kb-read-epd.ts`). |
| **C. Full LCA / regulatory story (e.g. EN 15804 modules)** | Per-module indicators, biogenic CO₂, geography, DNs… | **Not implemented** as first-class triples — would be **new ontology + importer fields**, not “one more download”. |

Sources like **INIES**, **ECO Portal**, **KBOB** help with **A/B** by adding **more `ont:EPD` rows** (and literals) into **snapshots** — they do not automatically add **C** unless we extend the schema and importers.

---

## 2. Triple checklist — KB shape the code expects

### Material (`bim:material-{id}`)

| Predicate | Role |
|-----------|------|
| `rdf:type` `ont:Material` | From enrich |
| `schema:name` | IFC / layer label |
| `ont:layerSetName` | Optional |
| `ont:hasEPD` → `bim:epd-{slug}` | **Required** for “linked” |
| `ont:standardName`, `ont:category`, `ont:subcategory` | After translate |
| `ont:matchType`, `ont:matchConfidence` | After translate |
| `ont:sourceMatchScore` | When source match |
| `ont:source` | Provenance hint |

**Gap:** materials with **no** `ont:hasEPD` → not “incomplete triple schema” — **no match**.

### EPD (`bim:epd-{slug}`)

| Predicate | Role |
|-----------|------|
| `rdf:type` `ont:EPD` | Always |
| `schema:name` | Label |
| `ont:gwpPerUnit` | **Required for calculate** (numeric) |
| `ont:declaredUnit` | **Required** for unit logic (often `kg`) |
| `ont:density` | Optional (volume → mass) |
| `ont:epdDataProvenance` | `source-import` vs `dictionary-no-lca-data` |
| `ont:source`, `ont:sourceProductUri`, `ont:resolvedAt` | When copied from source |

**Gap for “calc-ready”:** missing **`gwpPerUnit`** or placeholder provenance — **literal gap**, not a missing predicate name.

### Calculation output (`data/*-calc.ttl`)

See `POST /api/calculate`: `ont:CalculationRun`, `ont:CalculationItem`, `ont:kgCO2e`, etc. — **only after** a successful run with allowed EPDs.

---

## 3. What we do **not** store yet (so “100%” ≠ “all EPD PDF fields”)

Examples many programmes publish; **we have no standard triples** for them in the KB pipeline today:

- Indicators **by module** (A1–A3, A4, A5, B, C, D) as separate literals  
- **Biogenic carbon**, **GWP excl. biogenic**, etc.  
- **Geography** / **dataset year** as structured nodes (beyond ad-hoc literals if you hand-author TTL)  
- **Service life**, **reference flow** details  

Adding these would be a **product/ontology** decision + importer work — not solved by “find INIES” alone.

---

## 4. How extra sources help (INIES, ECO, …)

They increase:

- **Count** of `ont:EPD` subjects in **your** `data/sources/<id>/*.ttl`  
- **Coverage** of `ont:matchText` / `schema:name` vs IFC strings  
- **Chance** of **`ont:gwpPerUnit`** after hydration  

They do **not** automatically define a single “complete” triple set beyond what **`copyEpdFromSourceToBim`** / hand-pick TTL already map (`gwpPerUnit`, `declaredUnit`, `density`, …).

---

## 5. Practical “completeness” audit (project-level)

1. **Link coverage:** `materialsWithEPD / materialsTotal` from **Build KB** / `npm run report:epd`.  
2. **LCA coverage:** rows in Calculate with **LCA in KB = Yes** (trace table) vs **No**.  
3. **Schema wish-list:** if you need module splits, open a **separate** design doc for new `ont:*` predicates + calculate rules.

---

## Related

- [`sources-contract.md`](./sources-contract.md) — snapshot layout  
- [`epd-handpick-ttl.md`](./epd-handpick-ttl.md) — minimal EPD triple shape for extra programme rows  
- [`kg-dictionary-source-hydration.md`](./kg-dictionary-source-hydration.md) — when GWP appears  
- [`reuse-locales-and-sources.md`](./reuse-locales-and-sources.md) — reuse vs locale-specific data  
