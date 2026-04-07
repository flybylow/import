# Plan: tiered opacity & highlight (Building IFC viewer)

Implements the policy in **`docs/building-ifc-viewer-opacity-highlighting.md` §10**. Goal: same URL semantics (express ids + optional groups), but **bounded fragments-worker work** so large selections do not trigger stress mode or UI freezes.

---

## 1. Scope

**In scope**

- Derive a **highlight tier** from the **count of express ids** in the current focus operation (after resolving `focusExpressId` + `focusExpressIds`).
- Adjust **uniform ghost**, **per-id `setOpacity` elevation**, **`highlightByID` id sets**, and **camera `getMergedBox` / `setLookAt`** per tier.
- Surface **tier + cap** in debug / optional chrome so users know when a subset is shown.
- Unit tests for pure tier helpers.

**Out of scope (later)**

- New backend index endpoints (reuse existing passport/KB lists; tier only shapes **viewer** behavior).
- Changing Passports **abstract** (`BimViewer3D`) layout beyond passing the same tier constants if shared.
- `view/page.tsx` and `kb/page.tsx` embeds: optional follow-up to pass tier overrides once `/bim` is proven.

---

## 2. Single source of truth for numbers

Add a small module, e.g. **`src/lib/ifc-highlight-tiers.ts`**, exporting:

| Export | Purpose |
|--------|---------|
| `IFC_HIGHLIGHT_TIER_A_MAX` | `32` — full ghost + lift + camera (§10 table) |
| `IFC_HIGHLIGHT_TIER_B_MAX` | `256` — prefer no bulk lift; Highlighter ok |
| `IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP` | `64` — max ids passed to `highlightByID` in tier C |
| `type IfcHighlightTier` | `'A' \| 'B' \| 'C'` |
| `ifcHighlightTierFromFocusCount(n: number)` | `n === 0` → treat as clear; `n <= 32` → A; `n <= 256` → B; else C |
| `effectiveUniformGhostForTier(requested: boolean, tier: IfcHighlightTier)` | Tier A: `requested`; tier B/C: **`false`** for **opacity baseline** (ignore URL ghost for large sets — §10.2) |
| `capExpressIdsForHighlighter(ids: number[], tier: IfcHighlightTier)` | A/B: full sorted unique array; C: **first N** after sort (deterministic), return `{ capped, total, truncated }` |

**Note:** Chunk constants in `BuildingIfcViewer.tsx` (`IFC_SET_OPACITY_CHUNK_*`) stay as implementation details for worker batching; tier thresholds are **product** limits and live only in `ifc-highlight-tiers.ts`.

---

## 3. Phase A — Library + tests

1. Implement **`src/lib/ifc-highlight-tiers.ts`** with the exports above.
2. Add **`src/lib/ifc-highlight-tiers.test.ts`** (or colocate with project test layout): edge cases `0, 1, 32, 33, 256, 257`, duplicate ids in input, `effectiveUniformGhostForTier` when `requested` is true/false per tier.

**Exit criteria:** `pnpm test` (or `vitest`/`jest` as configured) green for the new file.

---

## 4. Phase B — `BuildingIfcViewer` integration

**File:** `src/features/bim-viewer/components/BuildingIfcViewer.tsx`

### 4.1 Resolve effective focus list and tier

Where focus is computed today (refs + effect driving `focusCameraOnExpressIds`):

- Build **`effectiveFocusIds`**: non-empty `focusExpressIds` wins; else `focusExpressId != null` → single-element array; else empty.
- **`tier = ifcHighlightTierFromFocusCount(effectiveFocusIds.length)`** (when length > 0; empty → clear path unchanged).
- **`opacityGhostEnabled = effectiveUniformGhostForTier(uniformGhost prop, tier)`** — use this **only** for `baselineOpacityIntent` / `syncFragmentOpacityFromIntent` / elevation paths, **not** for replacing the parent’s URL toggle state (parent still owns `ghost=` in the address bar).

Alternatively: keep prop `uniformGhost` as user intent but pass an internal ref **`uniformGhostForOpacityRef`** that the opacity pipeline reads, updated whenever tier or prop changes.

### 4.2 `applyFocusGhostHighlightOnly`

- Input ids for **Highlighter** and **elevation**: use **`capExpressIdsForHighlighter`** in tier C; log once when `truncated` (dev) or record in **`BuildingIfcAlphaDiagSnapshot`** (optional field `highlightCap?: { total, shown }`).
- **Elevation** (`elevateFocusedExpressIdsOpacity`): run **only** if `opacityGhostEnabled` and tier **A** (§10: B/C skip bulk lift).
- **`highlightByID`**: use **capped** set in tier C; still call `pumpFragmentsVisual` after.

### 4.3 `focusCameraOnExpressIds`

- Tier **C**: **skip** `getMergedBox` on full list; either **skip auto camera** or compute bbox on **capped** ids only (document which UX you choose in code comment).
- Tier **B**: keep camera but watch for cost; if `getMergedBox` proves heavy for ~200 ids, fall back to capped bbox (same as C) in a follow-up.

### 4.4 `applyVisualGroupsOverlay`

- For each group, if `g.expressIds.length > IFC_HIGHLIGHT_TIER_B_MAX`, apply **same cap** as tier C (or a separate `VISUAL_GROUP_CAP`) so demo overlays cannot DOS the worker.

### 4.5 Debug / handle API

- Extend **`getAlphaDebugSnapshot`** (or adjacent type) with **`highlightTier`** and optional **`highlightCap`**.
- **`BimIfcAlphaDebugPanel`**: show tier + “showing n of m” when truncated.

**Exit criteria:** Manual test on `/bim` with material slug / visualizer producing >256 ids: no long freeze; stress mode rare; Solid appearance for large group even if Ghost is toggled in URL.

---

## 5. Phase C — Call sites and UX copy

| Location | Change |
|----------|--------|
| **`src/app/bim/page.tsx`** | When `visualizerExpressIds?.length` exceeds tier B, show a **non-blocking** banner next to existing material URL chrome: e.g. “Large selection — ghost disabled for performance; highlighting N of M.” Use same `capExpressIdsForHighlighter` / tier from **`ifc-highlight-tiers`** so copy matches viewer. |
| **`PassportIfcMiniPreview.tsx`** | No prop change if tier is **internal** to `BuildingIfcViewer`; if you add optional `highlightTierOverride`, pass only when needed. Prefer **no** override first. |
| **`PassportModelView.tsx`** | If it builds `focusExpressIds` for the mini preview, ensure list is **deduped sorted** before pass (helps deterministic cap). |

**Exit criteria:** Stakeholder can open a large material group and read why the visual differs from small groups.

---

## 6. Phase D — Docs and regression checklist

1. In **`docs/building-ifc-viewer-opacity-highlighting.md` §10.4**, replace “tier switch not implemented” with a link to this file and a one-line “implemented in …” note once shipped.
2. Manual regression checklist (record in PR description):
   - Single `expressId` + Ghost on → previous behavior (outline + lift).
   - `ghost=0` + small multi-select → Highlighter, no lift.
   - Material visualizer with **>256** ids → solid baseline, capped highlight, banner.
   - Stress mode still recovers only on reload (unchanged).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Tier C cap hides important geometry | Deterministic sort by express id + clear UI “N of M”; deep-link still lists full set in sidebar/KB. |
| `highlightByID` still OOM on cap 64 for some models | Lower `IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP` or gate on `fragmentsOpacityStressRef` (skip highlight, show message only). |
| `effectiveUniformGhostForTier` ignores user Ghost for large groups | Banner explains; optional future `ghost=force` escape hatch (documented) if product insists. |

---

## 8. Suggested implementation order

1. **`ifc-highlight-tiers.ts` + tests**  
2. **`BuildingIfcViewer`** (4.1 → 4.2 → 4.3 → 4.4 → 4.5)  
3. **`bim/page.tsx` banner**  
4. Doc §10.4 update + manual QA  

Estimated touch count: **~4 files** core (`tiers`, `tiers.test`, `BuildingIfcViewer`, `bim/page`) + **1** optional (`BimIfcAlphaDebugPanel`).

---

*Last updated: 2026-04-06.*
