# Source snapshot folders & `config.json` contract

This document defines how **versioned EPD source graphs** are stored, selected, and matched in Phase 2. It is the single reference for **folder layout**, **active config**, and **reproducibility**.

## Folder layout (immutable snapshots)

```
data/sources/
├── kbob/
│   ├── kbob-<YYYY-MM-DD>-v<semver>.ttl      # merged KBOB Liste import
│   └── kbob-<YYYY-MM-DD>-v<semver>.report.json
├── ice/
│   ├── ice-educational-<YYYY-MM>-v<semver>.ttl
│   └── ice-educational-<YYYY-MM>-v<semver>.report.json
└── epd-hub/
    ├── epd-hub-handpick-<YYYY-MM-DD>.ttl     # curated EPD Hub / programme rows (manual)
    └── epd-hub-handpick-<YYYY-MM-DD>.report.json
```

**`epd-hub`:** hand-authored Turtle for specific programme registrations (EPD Hub, Environdec, B-EPD, …). See [`epd-handpick-ttl.md`](./epd-handpick-ttl.md). `config.json` entry: `"type": "epd-hub"`.

- **One TTL + one report** per import run. Filenames encode **dataset identity + version**; do not overwrite in place—add a new pair and point `config.json` at it when validated.
- **Git**: commit snapshots that you want builds to reproduce; large files may use Git LFS (project policy).
- **Inputs** (not always committed): KBOB xlsx under `docs/DataSetMaterials/`, ICE workbook under `docs/DataSetMaterials/ICE DB Educational .../`.

## `config.json` schema (active sources)

Top-level object:

| Field | Type | Description |
|-------|------|-------------|
| `sources` | `SourceEntry[]` | Ordered list. **First wins** in Phase 2 source matching after the dictionary. |

`SourceEntry`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Stable id (e.g. `kbob`, `ice-educational`). Used in UI and APIs. |
| `type` | string | yes | Importer type: `kbob` \| `ice-educational` \| `epd-hub` (hand-pick TTL). |
| `ttlPath` | string | yes | Repo-relative path to the **active** snapshot TTL. |
| `enabled` | boolean | no | Default `true`. If `false`, matcher skips this source. |

**Matching order (Phase 2):**

1. `src/data/material-dictionary.json` (routing / labels; EPD literals prefer source hydration when possible—see `docs/kg-dictionary-source-hydration.md`).
2. `config.json` → `sources` **in array order** (only entries with `enabled !== false` and existing `ttlPath`).
3. Unmatched materials → manual override on `/kb` or future sources.

## Report file contract (`*.report.json`)

Each importer writes a sibling file next to the TTL:

| Field | Meaning |
|-------|---------|
| `generatedAt` | ISO timestamp of import |
| `inputFile` | Path to xlsx used |
| `outputTtl` | Path to written TTL |
| `rowCount` | Rows imported as EPD entities |
| (optional) | Extra fields per importer |

Used by **`GET /api/sources`** and the **Sources** / **KB** UIs.

## Commands

```bash
npm run import:kbob    # KBOB Liste → data/sources/kbob/…
npm run import:ice     # ICE Educational → data/sources/ice/…
npm run import:sources # both
```

Importers are **`node scripts/import-kbob.js`** and **`node scripts/import-ice.js`** (paths configurable inside scripts).

## Reproducibility checklist

1. Note **input xlsx path + hash** (or commit the file if allowed).
2. Commit **TTL + report** pair you rely on.
3. Pin **`config.json`** `ttlPath` to that pair.
4. Record **ICE** attribution: see `docs/data-sources-kbob-ice.md` (Terms of Use PDFs).

## Related code

- Config load/save: `src/lib/sources-config.ts`
- Merge + match: `src/lib/source-match.ts`, `src/lib/layer2-translate.ts`
- API: `src/app/api/sources/route.ts`
- UI: `src/app/sources/page.tsx`, `src/app/kb/page.tsx`
