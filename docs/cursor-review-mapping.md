# Reviewing material → EPD mappings (Cursor / manual QA)

## What you are looking at

Rows like **IFC layer name → EPD slug → Yes/No** are **not** a list of files to find on disk. They are **Phase 2 KB rows**: each line is a **material** in the enriched graph linked to an **`ont:EPD`** (or not).

- **Yes** (LCA data): the KB has **`ont:gwpPerUnit`** (and related) on that EPD, usually from **KBOB/ICE** hydration.
- **No**: the material still has an EPD **node** (dictionary route) but **no** numeric LCA in the graph yet — **`dictionary-no-lca-data`**, or the source did not score a matching product.

## Can “Cursor” check this automatically?

**Not fully.** Cursor can:

- Help you **interpret** pasted tables (Composer / Agent).
- Suggest **dictionary** or **`material-norm.ts`** edits from example rows.
- Run **`npm run report:epd`** and **`npm run build`** after changes.

It **cannot** prove an EPD is **environmentally correct** for a trade name — that needs **domain QA** (right product family, declared unit, module).

**Practical workflow**

1. Export or copy the **Calculate** / **KB** table from the app.
2. Paste into Cursor and ask: *“Which rows look like wrong product families?”* (e.g. EPS vs glass wool).
3. Encode fixes in **`src/data/material-dictionary.json`** (order: **specific** insulation types **before** `insulation_generic`) and **`src/lib/material-norm.ts`** (Dutch tokens → English for ICE `matchText`).
4. Re-run **`npm run report:epd`** and **Build KB** on `/kb`.

See also **`docs/trace-table-for-dictionary.md`** for how to use the Calculate **full trace table** (columns, prioritisation, quantity hints).

## Recent product-family fixes (2026-03-26)

- **Zinc** (`Zink`, `zinkwerk`) is **not** steel — separate **`zinc_work`** route (ICE Educational has **no** zinc row → expect **No** until you add a source or manual EPD).
- **Insulation** split: **PIR**, **EPS**, **XPS**, **glass wool** routes **before** generic so EPS/PIR rows do not all hydrate as “Glass Wool”.
