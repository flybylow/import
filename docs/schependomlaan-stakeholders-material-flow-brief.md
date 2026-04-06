# Schependomlaan: repo access, data layout, actors, and one material example

Short answers for collaborators mapping **Belgian construction law / PID** to this codebase. Not legal advice.

---

## 1. Your bimimport repo? (GitHub link or instructions)

- **This workspace** is often checked out as a folder named `bimimport` (local path only).
- **Git remote observed in this clone:** `https://github.com/flybylow/import`  
  If you fork or rename the GitHub repo, use your canonical URL; the app does not embed a single hard-coded “official” link beyond what `git remote` shows.

**Run locally**

```bash
git clone https://github.com/flybylow/import.git
cd import   # or your folder name
npm install
npm run dev
```

Open `http://localhost:3000`. Many flows are **`?projectId=…`**-driven (e.g. `schependomlaan-2015`).

**Canonical open dataset (not the app repo)**  
Schependomlaan research data: [openBIMstandards/DataSetSchependomlaan releases](https://github.com/openBIMstandards/DataSetSchependomlaan/releases) — full zip as documented in `docs/DataSetArch/README.md`.

---

## 2. Structure: how timeline + BIM + documents are stored today

Everything is **file-based under the repo** (no app-managed SQL). Typical **per-`projectId`** artifacts:

| Concern | On-disk pattern (examples) | Consumed by |
|--------|----------------------------|-------------|
| **IFC (BIM)** | `data/<projectId>.ifc` | `/api/file`, `BuildingIfcViewer`, Phase 1 import |
| **Phase 1 graph** | `data/<projectId>.ttl` | Enrichment input |
| **Enriched** | `data/<projectId>-enriched.ttl` | KB build |
| **Knowledge base** | `data/<projectId>-kb.ttl` | `/kb`, `/api/kb/status`, passports |
| **Carbon calc output** | `data/<projectId>-calc-latest.json`, `data/<projectId>-calc.ttl` | `/calculate` |
| **Timeline (RDF)** | `data/<projectId>-timeline.ttl`, plus shared seeds like `data/schependomlaan-timeline.json` | `/api/timeline`, `/timeline` |
| **Schedule links (optional)** | `data/<projectId>-schedule-links.json` | MS Project XML import; task ↔ expressId / material hints |
| **Deliveries (optional)** | `data/<projectId>-deliveries.ttl` | Ingest API + `/deliveries`; appends timeline events |
| **Compliance runs (optional)** | `data/<projectId>-compliance-events.ttl` | `/api/compliance-run` |

**Narrative flow** (simplified): **IFC → TTL phases → KB → passports/calculate**; **timeline** is a **parallel audit graph** that can reference materials/elements when seeders/importers attach them. See `docs/bim-to-kg-journey.md`, `docs/timeline-source-provenance.md`, and `docs/BASE.md` (notes log).

**Documents** (PDFs, native Archicad, etc.) largely live under **`docs/DataSetArch/`** (dataset mirror) or **`public/`** for small served assets — not all are wired into the app; the **pipeline** focuses on **IFC + TTL + JSON/CSV** inputs.

---

## 3. Actor list for Schependomlaan (confirm + extend)

From **`docs/DataSetArch/README.md`** (dataset description):

| Role | Named in dataset readme |
|------|-------------------------|
| **Client / developer (Bouwheer–like)** | **Hendriks Bouw en Ontwikkeling** |
| **Architect (design BIM)** | **ROOT bv** (Archicad model for the design IFC) |
| **Research / data collection** | **TU/e ISBE** (Stijn van Schaijk thesis), with **TNO**, **RAAMAC**, and the parties above |

The readme also describes:

- **Subcontractors** (trades): flooring, walls, stairs, fencing, steel, roofs, prefab — some deliver **IFC/DWG**, coordinated in **Tekla BIMsight** (`.tbp`, BCF).
- **Quality / coordination**: **Solibri** Model Checker → **BCF 2.0** issues.

**Explicitly *not* a verified actor table in this repo**  
There is **no** maintained RDF vocabulary here that equals “Bouwheer, architect, aannemer, EPB, veiligheidscoördinator, …” as formal legal roles. For **process mining**, the dataset even ships an **event log with “FAKE” actors** (synthetic social-network experiment) — see readme §Event logs: `Schependomlaan eventlog … incl Actors FAKE.csv`.

**Reasonable “who else?” for Belgian real projects** (you would confirm per contract / PID):

- **Structural engineer** (stability / staal-beton)
- **Technical building services** (EPB / HVAC / techniques) — sometimes separate from architect
- **Safety coordination** (veiligheidscoördinator niveau 1/2 where applicable)
- **EPB / energy** consultant
- **Site management** (werfleiding) vs **general contractor** (hoofdaannemer) when distinct
- **Suppliers / merchants** (e.g. Wienerberger, regional wholesalers) — **not** the same as subcontractor BIM authors

For **legal-grade flows**, treat this readme + CSV headers as **dataset provenance**, not as a complete **party register** for Schependomlaan contracts.

---

## 4. Material naming — one real example (what the repo actually contains)

The app does **not** currently store four synchronized columns (**lastenboek → IFC → leveringsbon → werkbon**) as linked facts. Below is **what you can point to in-repo today**, plus gaps.

### Example A — **IFC / KB path** (enriched TTL + element “layer” name)

From **`data/schependomlaan-2015-enriched.ttl`**:

- **What appears as the element / layer label in the graph** (`schema:name` on `bim:element-…`):  
  **`buitenblad`** (outer leaf of a wall; Archicad-style layer naming).
- **Linked IFC material node** (`ont:madeOf bim:material-624288`):  
  **`schema:name` → `03 Metselwerk - cellenbeton`** (Dutch material description in the design model).

Concrete triples (abbreviated):

- Element: `bim:element-1004073` — `schema:name "buitenblad"`, `ont:expressId 1004073`, `ont:globalId "2xwBlNrYfAchV3j2l7PQmO"`, `ont:madeOf bim:material-624288`.
- Material: `bim:material-624288` — `schema:name "03 Metselwerk - cellenbeton"`, `ont:ifcType "IfcMaterial"`.

### Example B — **As-planned event log (CSV)** (task + material token)

From **`public/data/eventlog_IFC_schependomlaan.csv`** (columns include `Material`, `Task`, `Resource`, `TaskName`, dates):

- Example row: wall **material token** **`IFC_kalkzandsteen_214mm`**, **task** **`ST00130`**, **resource** e.g. `liftwand_(#30267)`, **task name** **`Bekisten liftwanden`**, dates **6-3-2015**.

That **`Material`** string is the **event-log convention** tying schedule rows to IFC-ish product codes — **not** automatically the same string as every `schema:name` on `bim:material-*` in TTL (the graph uses both human layer names and `IFC_*` style names in different places).

### Lastenboek (specification)

- **Not available in structured form** inside this app repo. The **open dataset** may contain PDFs/specs in the **full zip**; linking “clause X → material Y” is **out of scope** of the current pipeline unless you add documents + extraction.

### Leveringsbon (delivery note)

- **`data/schependomlaan-2015-deliveries.ttl`** contains **example / demo** delivery lines (e.g. **Wienerberger NV**, **Porotherm 38 T Profi**, etc.) used to exercise **`dpp:DeliveryNote`** / **`dpp:DeliveryLine`** and EPD matching — **not** proven in-repo as OCR of a real Schependomlaan leveringsbon tied to `expressId` 1004073.
- For a **real** leveringsbon workflow, see **`docs/deliveries-importer-integration.md`** and the ingest API described in `docs/BASE.md`.

### Werkbon (site work order)

- The **CSV event log** gives **construction tasks** (e.g. *Bekisten*, *Stort*, *Wapening*) — **closest in-repo proxy** for “what happened on site” in **4D scheduling** terms.
- A formal **werkbon PDF** or ERP line items are **not** modeled here.

**Honest one-liner for stakeholders**  
*We can show **IFC material strings** and **schedule/event material tokens** side by side in the same dataset family; we do **not** yet have a verified four-way join to **lastenboek clauses** and **supplier delivery slips** for one wall.*

---

## 5. Belgian law / PID flow — which case to stress-test first?

**Start with Schependomlaan** in this repo:

- **Most wiring exists**: IFC on disk, enrichment, KB, passports, timeline seed + provenance docs, optional deliveries and schedule imports.
- **Medical clinic IFC** is **not** referenced in this codebase under a `projectId` we could find; use it **after** you have a **`projectId`**, IFC path, and (ideally) the same class of artifacts (TTL phases, timeline, documents).

**Suggested order**

1. **Schependomlaan** — prove **material identity** (IFC ↔ KB ↔ EPD) + **timeline** (CSV/XML/BCF) + **gap list** for lastenboek/leveringsbon/werkbon.
2. **Second project (e.g. clinic)** — rerun the same **artifact checklist** (`docs/bim-to-kg-journey.md`, `GET /api/pipeline/trace?projectId=…`) and extend **actor + document** modeling only where the law requires it.

---

## Related docs

- `docs/DataSetArch/README.md` — dataset parties, file types, fake actors warning  
- `docs/timeline-source-provenance.md` — timeline file graph  
- `docs/bim-to-kg-journey.md` — phase artifacts  
- `docs/pid-digitization-plan.md` — PID digitization scope (not legal advice)  
- `docs/deliveries-importer-integration.md` — delivery note ingest  

---

*Generated for collaboration; align with your lawyer / EPB advisor before relying on role names or compliance mappings.*
