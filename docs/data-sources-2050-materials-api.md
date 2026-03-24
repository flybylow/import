# 2050 Materials API — capabilities and integration notes

Official overview: [Using the 2050 Materials APIs](https://docs.2050-materials.com/readme/using-the-2050-materials-api).

2050 Materials exposes a **construction sustainability data API**: aggregated **EPDs**, supplier data, and **generic material factors**, normalized for tools that need **embodied carbon / LCA** in design, estimating, or reporting workflows. They describe **AI-assisted gap-filling and uncertainty flagging** on top of structured datasets.

---

## What you can do with it (by endpoint)

| Endpoint (see Swagger) | Purpose | Typical use |
|------------------------|---------|-------------|
| **`/get_products_open_api`** | **Open** access: **limited** product data — notably **GWP** and **modules A1–A3** | Quick lookups, prototypes, public tools without a full commercial licence |
| **`/get_products`** | **Full** product payloads: **complete LCA breakdown** and **augmented** fields for **construction products** (global catalog) | Product-level calculators, detailed reporting, BoM/BoQ enrichment |
| **`/get_generic_materials`** | **Generic** materials/products with **full LCA** and augmented data | Early design, when you only have material classes, not specific SKUs |
| **`/get_best_match`** | **Automated mapping** from **Bill of Quantities (BoQ)** lines to **generic materials** and/or **products** | Reducing manual EPD picking; batch workflows from estimating exports |
| **`/get_co2_warming_potential`** | **Embodied carbon** and **warming potential** estimates for **building typologies** and **assemblies** | Concept / early-stage whole-building or assembly-level screening ([methodology](https://docs.2050-materials.com/methodology-documentation)) |

Interactive contract: [Swagger UI](https://app.2050-materials.com/developer/documentation-ui/).

---

## Access and authentication

- **Developer token** (account page): register on the [2050 Materials platform](https://app.2050-materials.com/accounts/login/), then create a token on the [account page](https://app.2050-materials.com/accounts/edit-account/).
- **Calling `/developer/api/*`:** use **`GET /developer/api/getapitoken/`** with header `Authorization: Bearer <developer_token>`. The JSON response includes **`api_token`** (and **`refresh_token`**). Use **`Authorization: Bearer <api_token>`** on product/generic/best-match routes. The bare developer JWT alone returns **401** (`token_not_valid` / “Token has no id”). See **`npm run test:2050`** (`scripts/test-2050-api.mjs`).
- **Open API** (`/get_products_open_api`): same exchange step; then call with the **api_token**. Documented in the [Open API tag](https://app.2050-materials.com/developer/documentation/#tag/get_products_open_api).
- **Other endpoints** (`/get_products`, `/get_generic_materials`, `/get_best_match`, `/get_co2_warming_potential`): **licence / commercial access** — contact [api@2050-materials.com](mailto:api@2050-materials.com) per [their docs](https://docs.2050-materials.com/readme/using-the-2050-materials-api).
- **Licensing framing** (from docs): aimed at organizations building **carbon tools**, linking data into **cost estimation**, or enriching **real estate / climate risk** metrics.

**Pricing / tiers** (marketing site, not a legal contract): the [Sustainability Data API](https://2050-materials.com/sustainability-data-api/) page lists plans such as a **Test** tier with **100 API calls / hour** and higher tiers with **unlimited API calls** and monthly **data requests** — verify current terms on their site before relying on limits.

---

## Developer tooling

| Resource | URL | Notes |
|----------|-----|--------|
| **SDK** | [sdk.2050-materials.com](https://sdk.2050-materials.com/) | Main API SDK |
| **Notebooks** | [Google Drive folder (Colab / Jupyter)](https://drive.google.com/drive/u/1/folders/1myaeDCS5YdzITTjwwrjQP8_s-fBcVDWd) | Copy before use; add your **private** token locally |
| **GitHub org** | [github.com/2050-Materials](https://github.com/2050-Materials) | Additional open-source SDKs |
| **Python** | [aecdata on PyPI](https://pypi.org/project/aecdata/) | Python client library referenced in docs |
| **Intro video** | [YouTube — linked from docs](https://www.youtube.com/watch?v=EFjUxIDjB9c) | Walkthrough |

---

## Scale (as claimed on the product site)

The [marketing API page](https://2050-materials.com/sustainability-data-api/) states **~180,000 structured EPDs** and **~12,500 generic material datapoints**, plus early-stage embodied impact via building parameters. Treat counts as **vendor claims**; validate against responses and licence scope.

---

## Possible fit for this repo (bimimport)

Not implemented today — **ideas only**:

1. **`/get_best_match`** — map IFC / dictionary **material labels** or extracted BoQ-like rows to **product or generic** records, similar in spirit to `source-match` / EPD handpick flows.
2. **`/get_products` / `_open_api`** — hydrate **`ont:EPD`-style** nodes or calc inputs where programme EPDs are missing, with explicit **provenance** and **module** discipline (align with EN 15804 + declared units).
3. **`/get_generic_materials`** — early-phase **placeholder GWP** when only material class is known.
4. **`/get_co2_warming_potential`** — **screening** layer for whole-model or typology benchmarks, separate from element-level passports.

**Caveats:** licence cost, rate limits, **ToS** on caching and redistribution, and **jurisdiction / representativeness** for BE/NL projects should be checked before any bulk ingestion into `data/sources/` or the knowledge graph.

---

## Smoke test in this repo

After setting `MATERIALS_2050_API_TOKEN` in `.env`:

```bash
npm run test:2050
```

This runs `scripts/test-2050-api.mjs`: exchanges the developer token via **`getapitoken/`**, then calls **`get_best_match`**, **`get_products`**, and **`get_products_open_api`**. On a typical account, **`get_products_open_api`** returns **200** with paginated results; **`get_best_match`** / full **`get_products`** may return **401** until the subscription is approved or upgraded (API error messages say so explicitly).

---

## Quick link list

- Docs hub: [docs.2050-materials.com — Using the API](https://docs.2050-materials.com/readme/using-the-2050-materials-api)
- SDKs page: [Notebooks and SDKs](https://docs.2050-materials.com/readme/using-the-2050-materials-api/sdks)
- Swagger: [app.2050-materials.com/developer/documentation-ui](https://app.2050-materials.com/developer/documentation-ui/)
- Methodology: [docs.2050-materials.com/methodology-documentation](https://docs.2050-materials.com/methodology-documentation)
- Contact (full API access): `api@2050-materials.com`
