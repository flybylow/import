# KG expansion: fastest paths & where to get data (BE / NL / EU)

Goal: grow the **knowledge graph** (more `ont:EPD` nodes, stable IDs, geography, modules) the same way we did **KBOB / ICE** — identify **downloadable or API-accessible** sources, then snapshot → TTL (or federated query later).

**Fastest wins** are usually: **(1)** machine-readable **EPD hubs** with bulk or API access, **(2)** national **consultation DBs** (export where allowed), **(3)** **license-gated** national LCA DBs (plan for manual export or partnership).

---

## 1. TL;DR — order to explore (speed vs NL/BE fit)

| Priority | What | Why fast | NL/BE |
|----------|------|----------|--------|
| **A** | [ECO Platform](#eco-platform--eco-epd-programmes) + [EPD Hub / “ECO Portal” style aggregators](#epd-hub--digital-epd-libraries) | Many **verified** EPDs, **program IDs**, digital formats; EU-wide | Filter by operator / geography in KG |
| **B** | [Building Transparency EC3](#building-transparency-ec3) | **API** + huge catalog; good for **product-level** GWP and metadata | Global; filter BE/NL in post-processing |
| **C** | [INIES](#inies-france) (France) | Large **FDES** set; **webservice** mentioned on site; RE2020 ecosystem | Adjacent market; often similar product mix to BE/NL |
| **D** | [Belgium B-EPD](#belgium-b-epd-federal) | **Federal consultation DB** — authoritative for BE claims | **BE-specific** |
| **E** | [Netherlands NMD](#netherlands-nmd-stichting-nmd) | **The** NL regulatory stack references NMD-style data | **NL-specific**; **full calc datasets often license-only** |
| **F** | [TOTEM](#totem-belgium-regions) | Belgian **generic + B-EPD-linked** story; good for **process understanding** | **BE-specific**; not always a raw bulk download |

---

## 2. National / regional LCA databases

| Info | Why useful in a graph | Belgium / Netherlands — where to go | Access / download notes |
|------|------------------------|--------------------------------------|-------------------------|
| **National LCA DB rows** | Extra **EPD-like** profiles; **MPG / regulatory** alignment; local **representativeness** | **NL:** [Nationale Milieudatabase (NMD)](https://milieudatabase.nl/) — Stichting NMD. Start: [Databases overview](https://milieudatabase.nl/database), [English downloads hub](https://milieudatabase.nl/en/downloadhub/), [Downloads](https://milieudatabase.nl/en/downloads/). **BE:** use **B-EPD** + **TOTEM** (below) rather than one “Belgium Excel”. | **Critical:** NMD **viewer** is for browsing; **bulk use in tools** typically needs **validated tooling / NMD licence** and **Downloadhub** (e.g. process DB for licence holders). Treat **licence + ToS** as a gate before automating. |
| **Regional Belgian tools** | Same as above, **region-specific** defaults | [TOTEM (Flanders)](https://ovam.vlaanderen.be/totem) · [EnergyVille / TOTEM product page](https://energyville.be/en/product/totem-tool-om-de-totale-milieu-impact-van-materialen-te-optimaliseren/) · [Brussels Environment — TOTEM](https://environnement.brussels/pro/documentation-et-outils/sites-web-et-outils-interactifs/totem-outil-devaluation-de-limpact-des-materiaux) | Web tool; **data** often embedded in the tool — **identify** whether B-EPD + generics are enough for KG or you need a **data partnership**. |

**KG pattern:** `ont:EPD` or `ont:EnvironmentalDataset` nodes with `ont:jurisdiction "NL"` / `"BE"`, `ont:dataSource "NMD"` / `"B-EPD"`, and `dcterms:source` / `rdfs:seeAlso` pointing to the **canonical portal URI**.

---

## 3. EPD programme + registration (stable IDs)

| Info | Why useful in a graph | Where | Access |
|------|------------------------|-------|--------|
| **Programme operator, ECO EPD** | **Stable programme IDs**, audit trail, **mutual recognition** | [ECO Platform](https://www.eco-platform.org/) — see [ECO EPD Programmes](https://www.eco-platform.org/the-eco-epd-programs.html), [documents / standards](https://www.eco-platform.org/our-documents.html) | Use programme list to tag `ont:epdProgram` on nodes; pull digital specs (e.g. digital data requirements PDFs on site). |
| **International EPD System** | Large catalogue, **URI patterns** for many EPDs | [Environdec — The International EPD® System](https://www.environdec.com/) | Search + per-EPD pages; bulk strategy = **API/partner** or **scraping policy check**. |
| **PEP ecopassport** | Electrical + **construction-relevant** PEPs; EU alignment | [PEP ecopassport](https://www.pep-ecopassport.org/) | Programme rules + registration; digital export depends on programme tooling. |

**KG pattern:** `ont:epdProgram "ECO"` / `"IBU"` / `"B-EPD"` / `"NEPD"` etc.; `dcterms:identifier` = registration number as published by the programme.

---

## 4. Geography / market (filter BE / NL)

| Info | Why useful | Where | KG |
|------|------------|-------|-----|
| **Filter “BE/NL-relevant”** | Avoid misleading matches from global data | Same sources as above; add **manual tags** from programme country or manufacturer location | `schema:areaServed` / `dcterms:spatial` / custom `ont:jurisdiction` on **EPD** or **source dataset** node. |

---

## 5. Declared unit & EN 15804 modules (apples-to-apples GWP)

| Info | Why useful | Where | Notes |
|------|------------|-------|--------|
| **Modules A1–A3, C, D, etc.** | Fair **matching** and **calculation** | Standard: **EN 15804+A2** (and product-specific PCRs) — purchase via [ISO / national standards bodies](https://www.iso.org/standard/77404.html); programme operators publish **PCR** PDFs | **Do not invent modules** — store **verbatim** module labels and **declared unit** on `ont:EPD`. |
| **Digital LCA formats** | Interop, future automation | **ILCD**, **EC3 / openEPD** ecosystems, programme-specific XML | Parse into literals on EPD nodes: `ont:declaredUnit`, `ont:gwpA1A3`, … (namespaced to your ontology). |

---

## 6. Industry vs product EPDs (like EC3’s split)

| Info | Why useful | Where | KG |
|------|------------|-------|-----|
| **Product vs industry / generic** | Correct **interpretation** and reporting | EC3 UI labels; NMD categories (brand / industry / generic); EPD text | `ont:epdKind` ∈ `{ product, industry, generic }` or `skos:broader` to a **generic parent**. |

---

## Curated product rows in this repo

To attach **specific** programme EPDs (e.g. EPD Hub `HUB-4855`) to the same matcher/calc pipeline as KBOB/ICE, add Turtle under `data/sources/epd-hub/` and enable **`epd-hub`** in `config.json`. See **[`epd-handpick-ttl.md`](./epd-handpick-ttl.md)** (declared unit, GWP scaling, `ont:matchText`).

---

## 7. Focused link list (bookmark)

### Netherlands — NMD (Stichting NMD)

- Landing: [milieudatabase.nl](https://milieudatabase.nl/)
- Database hub: [milieudatabase.nl/database](https://milieudatabase.nl/database)
- English **download hub** (licence-oriented): [milieudatabase.nl/en/downloadhub/](https://milieudatabase.nl/en/downloadhub/)
- **Downloads** page: [milieudatabase.nl/en/downloads/](https://milieudatabase.nl/en/downloads/)

### Belgium — Federal B-EPD

- Umbrella / official index: [belgium.be](https://www.belgium.be)
- EPD overview: [FPS Public Health — Environmental Product Declarations](https://www.health.belgium.be/en/professionals/enterprises/environment/construction-products/environmental-product-declarations-epd)
- **B-EPD programme**: [The Belgian EPD programme B-EPD](https://www.health.belgium.be/en/belgian-epd-programme-b-epd)
- **Consultation database** (“EPD database for construction products of the belgian federal authorities”): [consultation / digital service](https://www.health.belgium.be/en/tools/epd-database-construction-products-belgian-federal-authorities-consultation) — use the **“To the database”** entry on that page; if the path moves, search from [FPS Health — tools](https://www.health.belgium.be/en/tools) for “EPD database”.
- **Contact (as published on the service):** [epd@environment.Belgium.be](mailto:epd@environment.Belgium.be) — questions, comments, data access, complaints.

**What the federal service says (summary for KG design):**

| Point | Implication |
|--------|-------------|
| **Consultation** of environmental impact; EPDs **delivered by manufacturers** and **verified** | Good for **human-validated** product nodes; IDs should mirror **official registration** in B-EPD. |
| **Legal registration** when the product carries an **environmental claim** (with link to this site next to the claim) | Confirms **authority** of the DB for **Belgian market** claims — not the same as “open bulk download”. |
| **Building-level calculations** will use this DB | Aligns with **TOTEM** / federal LCA story — your graph links **material → EPD**; **building** MPG is downstream. |
| **Voluntary** registration possible; **some information may remain invisible** | Model **partial data**: e.g. `ont:dataAvailability "redacted"` / `dcterms:accessRights` where fields are missing. |
| **Do not use the DB alone to compare products** — “the final product is the building” | Store a **disclaimer** in docs/UI; prefer **declared unit + module** matching over raw GWP sort in app. |

### Belgium — TOTEM (three regions)

- Flanders: [ovam.vlaanderen.be/totem](https://ovam.vlaanderen.be/totem)
- EnergyVille summary: [energyville.be — TOTEM](https://energyville.be/en/product/totem-tool-om-de-totale-milieu-impact-van-materialen-te-optimaliseren/)

### France — INIES (high value for EU product mix)

**INIES** (national consultation system for construction products — **Alliance HQE-GBC**, e.g. site footer *INIES version … © Alliance HQE-GBC*) publishes **reference environmental and health data for buildings** (tagline: *données environnementales et sanitaires de référence pour le bâtiment*). It is the main French hub for **FDES** (and related) declarations used in **RE2020** / regulatory LCA workflows.

**Public UI (consultation — not the same as an open bulk API)**

- **Espace consultation** → **Recherche d’un produit**: filtered search (product name, declaring body, keywords, product family, VOC label, declaration type, environmental standard, production location, etc.).
- Other areas often include **catalogue de la base**, **modules ICV**, **données archivées**, **espace déclaration** (for manufacturers) — see the live site for current paths.
- **Français / English** UI is typical; underlying **product names and metadata** are often French-heavy.

**Integration with *this* repo**

- Same pattern as other national DBs: **browse/search** is for **human** selection; **automated** ingestion needs **explicit permission** (export rules, API/webservice if offered, partnership). Do **not** scrape at scale without checking **mentions légales** and contact terms.
- **KG path**: when you have a permitted extract, add a **versioned snapshot** + importer → **Turtle** under `data/sources/`, then wire **matcher order** in `config.json` (see §9).

**Links**

- Portal: [inies.fr](https://www.inies.fr/)
- FDES construction (context): [inies.fr — FDES construction products](https://www.inies.fr/en/inies-and-its-data/fdes-construction-products/)

### EU / global aggregators

- [ECO Platform](https://www.eco-platform.org/)
- [EPD Hub](https://www.epdhub.com/) (digital EPD library; check terms for bulk use)
- [Building Transparency EC3](https://buildingtransparency.org/) — material search: [ec3/material-search](https://buildingtransparency.org/ec3/material-search) — **API**: see Building Transparency developer / API docs (account usually required)

### Programmes (examples)

- [PEP ecopassport](https://www.pep-ecopassport.org/)
- [The International EPD® System — Environdec](https://www.environdec.com/)

---

## 8. “Unknowns” — what to record in the graph anyway

When data is **partial** (common for NL NMD or tool-embedded BE data):

| Unknown | KG approach |
|---------|-------------|
| Exact **GWP** not redistributable | Store `ont:dataAvailability "summary_only"` + link to **portal URI**; keep **manual** override at material level. |
| **Declared unit** mismatch | Store `ont:matchWarning` on `ont:hasEPD` or on material; prefer **calculation-time** check. |
| **Jurisdiction** unclear | Default to `unknown`; infer only from **programme operator country** with evidence URI. |
| **Licence** forbids bulk | Node `dcterms:accessRights "restricted"`; only **manual** rows in TTL from permitted exports. |

---

## 9. Next implementation step (aligned with this repo)

Same pattern as `docs/data-sources-kbob-ice.md`:

1. Pick **one** source with **clear redistribution rules** (often **ECO Platform–listed digital EPDs** or **your own licensed NMD export**).
2. Add a **versioned snapshot** under `data/sources/<id>/` + importer script → **Turtle** with `ont:source`, `ont:importedAt`, `dcterms:source`.
3. Extend matcher order in `config.json` and map **programme ID + declared unit + modules** onto `ont:EPD`.

---

*Last updated: 2026-03-23 — verify licensing and URLs before production use; national sites change paths.*
