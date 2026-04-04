# Integrating Tabulas / bimimport data with 3D authoring tools (Revit, SketchUp, and the “full loop”)

**Audience:** Someone writing a report or architecture decision on **exporting our enriched data** (materials, EPD-linked LCA, element-level CO₂) so **architects can open it in familiar 3D/BIM software**.

**Status:** Technical briefing based on **this repository’s pipeline and artifacts** (2026). Not legal advice; LCA scope (e.g. A1–A3 vs full modules) must be stated explicitly in any export.

---

## 1. Executive summary

| Question | Short answer |
|----------|----------------|
| Can architects **read our material and CO₂ data** in **Revit**? | **Yes, in principle**, if we deliver it in a form Revit can bind to elements—most reliably **IFC with custom property sets** and/or **Revit-native sidecars** (shared parameters, schedules, Dynamo). |
| Can they do the same in **SketchUp**? | **Partially.** SketchUp is not a full BIM authoring stack; **IFC** is the main open path, with **weaker** round-trip and property fidelity than Revit. |
| Is a **full loop** (import IFC → enrich in our pipeline → export back) realistic? | **Yes**, with **IFC as the hub** is the most standard path. Success depends on **which properties** you write back, **IFC schema version**, and **tool-specific** IFC mapping. |
| Does our app **today** write CO₂ back into an `.ifc` file? | **No.** Today we **read** IFC, build a **knowledge graph** (TTL), run **calculation**, and expose **JSON/API** (`GET /api/kb/status`, passports, calculate results). **Round-trip IFC export with LCA properties** is a **product/engineering** next step, not a shipped feature. |

---

## 2. What this codebase already produces (facts for integration design)

Understanding **where data lives** drives export design.

### 2.1 On-disk artifacts (per `projectId`)

| Artifact | Role |
|----------|------|
| `data/<projectId>.ifc` | **Source** geometry + native IFC materials / quantities / many Psets (input). |
| `data/<projectId>-enriched.ttl` | **Phase 1** — IFC parsed to RDF; **BaseQuantities** and many **Pset_*** fields captured (e.g. fire rating paths used downstream). |
| `data/<projectId>-kb.ttl` | **Phase 2** — Materials linked to **EPD** nodes (`ont:hasEPD`), **GWP**, **declared unit**, **density**, provenance, producer metadata, etc. |
| `data/<projectId>-calc-latest.json` / `*-calc.ttl` | **Phase 3** — **Carbon results** derived from KB LCA + IFC quantities (trace tables, per-material lines). |
| `data/<projectId>-timeline.ttl` (optional) | **Audit / supply chain** events (separate from geometry). |

See **`docs/bim-to-kg-journey.md`** for the end-to-end flow.

### 2.2 APIs and structured views

| Surface | Content |
|---------|---------|
| `GET /api/kb/status` | **Element passports**: per element (or deduped by name): `expressId`, `globalId`, `ifcType`, **IFC quantities**, **materials** with EPD slug, **GWP**, **density**, **EPD identifier**, producer, validity dates, match metadata, `ifcFireRating`, etc. |
| `GET /api/file?name=<projectId>.ifc` | Serves the **original IFC** for the in-browser viewer (**That Open** + **web-ifc**). |
| In-app `/bim` | **Building** = real IFC mesh; **Passports** = abstract boxes + same passport slice as API. |

**Implication for Revit/SketchUp:** The **richest machine-readable join key** between our graph and authoring tools is usually **`globalId`** (IFC GUID) and/or **`expressId`** (model-local). Any export should preserve those keys.

---

## 3. IFC as the default interoperability contract

**buildingSMART IFC** is the industry-standard exchange format between tools. Revit’s **IFC import/export** is mature relative to SketchUp.

### 3.1 How CO₂ and “material intelligence” can appear in IFC

IFC does **not** define a single global “CO₂” property for all tools. Standard practice is:

1. **Custom property sets** (e.g. `Pset_TabulasEnvironmental` or a project-specific name) attached to **`IfcElement`** or **`IfcMaterial`**-related entities, using **`IfcPropertySingleValue`** (or lists) with clear **unit** and **definition** text.
2. **Classification references** (e.g. link to an EPD programme id) as **IfcClassificationReference** or properties—useful for traceability.
3. **IFC4** vs **IFC2x3**: IFC4 has richer material/energy concepts in places; **confirm target** (Revit version + export settings).

**Important:** Our calculated CO₂ is often **derived** (quantity × factor with unit conversion). In IFC you typically store either:

- **Factors** at material/product level (e.g. kg CO₂e per declared unit), **and/or**
- **Results** at element level (e.g. kg CO₂e for that instance for a stated **module** such as A1–A3),

and you **document the methodology** in a human-readable property or sidecar PDF/JSON.

### 3.2 What architects “see”

- In **Revit**: imported IFC properties often land in **IFC parameters** / schedules depending on mapping; **native** experience may require **Revit shared parameters** filled via a **post-process** or **add-in**.
- In **SketchUp**: visibility depends on **IFC importer** and extensions; treat as **variable**.

---

## 4. Autodesk Revit — integration patterns

### 4.1 IFC round-trip

1. Export IFC from Revit → run through our pipeline → generate **augmented IFC** (new Psets or updated properties) → re-import or link in Revit.  
2. **Risk:** Revit may **not round-trip** every custom property unchanged; test per Revit version and **IFC mapping table**.

### 4.2 Revit API / Dynamo / add-in

- **Dynamo** or a **C# add-in** can read a **JSON** export from our system (mirroring `elementPassports` or calc trace) and set **Shared Parameters** on elements matched by **`ElementId`**, **`UniqueId`**, or **`IFC GUID`**.  
- This often gives a **better UX** than relying on IFC import alone.

### 4.3 OpenBIM adjuncts

- **IDS** (Information Delivery Specification) can specify **which properties** a model must contain—useful for **contractual** delivery of “CO₂-ready” models.  
- **BCF** is for issues/views, not LCA, but complements workflow.

---

## 5. SketchUp — integration patterns

SketchUp is **stronger for conceptual geometry** than for **full BIM + property round-trip**.

| Path | Notes |
|------|--------|
| **IFC import/export** | Possible with native/extension workflows; **property fidelity** and **large models** are common pain points. |
| **Trimble ecosystem** | Some teams use **Trimble Connect** or other connectors; evaluate licensing and whether **our** data should stay **tool-agnostic** (IFC + JSON). |
| **Recommendation** | For **architect CO₂ readout**, prefer **IFC → Revit** (or another BIM tool) for production; use SketchUp where the **contract** accepts lighter semantics. |

---

## 6. Could we put “material properties + CO₂” in one file?

**Yes, with caveats.**

| Approach | Architects read it? | Fidelity |
|----------|---------------------|----------|
| **Augmented IFC** (recommended hub) | High in Revit-like tools if mapped | Depends on IFC mapping |
| **JSON / CSV + original IFC** (sidecar) | Via scripts, Dynamo, or internal tools | Very high control |
| **glTF / USD** for viz only | Good for **3D**, poor for **BIM properties** unless custom extras | Not a replacement for BIM exchange |

Our in-browser **full mesh** path is documented in **`docs/PRD-browser-3d-ifc-and-vr.md`** (That Open + **web-ifc**). That stack is **visualisation**, not a substitute for **authoring-tool** property workflows.

---

## 7. Implementation options (for the other author’s decision table)

### Option A — **IFC writer** (server-side)

Use a toolkit (**IfcOpenShell**, **xbim**, **Geometry Gym**, etc.) to **clone** the input IFC and **inject** properties from `*-kb.ttl` / calculate output.  
**Pros:** One file delivery. **Cons:** Engineering effort, regression testing on large models, version-specific quirks.

### Option B — **Revit add-in / Dynamo** consuming our **JSON API**

Map `globalId` → Revit element; write **shared parameters** for GWP, EPD id, A1–A3 flag, etc.  
**Pros:** Best Revit UX. **Cons:** Revit-specific maintenance.

### Option C — **Neutral open package** (IFC + `manifest.json`)

Ship **unchanged IFC** + **structured JSON** (passports + calc) + **README** describing units and methodology.  
**Pros:** Fastest to spec; no IFC surgery. **Cons:** Architects must **install** a script or use a partner tool.

### Option D — **Classification / bSDD**

Register definitions in **buildingSMART Data Dictionary** style so properties are **named consistently** across projects. **Pros:** Long-term standardisation. **Cons:** Process overhead.

---

## 8. Gaps and risks to mention in the external report

1. **LCA scope:** Our KB emphasises **cradle-to-gate style** factors (e.g. A1–A3) in many EPD paths—**do not** label totals as “whole-life” without module clarity (**EN 15804** modules).  
2. **Provenance:** Materials may be **dictionary-routed**, **source-matched**, or **manual override**—exports should carry **`epdDataProvenance`** / source id where available (already modeled in KB; see passports API).  
3. **Unmatched materials:** No EPD → no defensible CO₂; exports should surface **missing data** explicitly (our **compliance pilot** logic on `/calculate` is a precedent).  
4. **Round-trip:** Revit and IFC exporters may **rename** or **drop** custom Psets; **pilot on real project IFCs**.  
5. **SketchUp:** Treat as **secondary** unless the client explicitly standardises on it.

---

## 9. Suggested recommendation (one paragraph)

**Standardise on IFC for BIM exchange**, and plan **two delivery tiers**: (1) **short term**—**sidecar JSON** (or API) keyed by **`globalId`** + documentation, optional **Dynamo** script for Revit; (2) **medium term**—**augmented IFC** with agreed **property set names** and **units**, validated with **IDS** where contracts require it. Position **SketchUp** as **supporting** only where IFC-based property exchange is acceptable to the client.

---

## 10. Internal references (this repo)

| Document | Topic |
|----------|--------|
| `docs/bim-to-kg-journey.md` | Pipeline artifacts IFC → KB → calculate |
| `docs/PRD-browser-3d-ifc-and-vr.md` | Browser IFC viewer stack (That Open, web-ifc, fragments) |
| `docs/pid-digitization-plan.md` | Broader product vision (export, audit, JSON-LD) |
| `docs/kg-triple-completeness.md` | What “complete” LCA graph means |
| `docs/compliance-data-checklist.md` | Fire rating + evidence checklist (pilot) |
| `src/lib/phase4-passports.ts` | Client URL for passport slice (`kbStatusPassportsUrl`) |
| `src/app/api/kb/status/route.ts` | Server-side **element passport** construction from KB |

---

## 11. Revision history

| Date | Change |
|------|--------|
| 2026-04-04 | Initial report for handoff to external author (Revit / SketchUp / full loop / CO₂ in IFC). |
