# Building IFC viewer — opacity, ghost mode, stress, and highlighting

Internal reference for **`BuildingIfcViewer`** (`src/features/bim-viewer/components/BuildingIfcViewer.tsx`). Complements **`docs/PRD-browser-3d-ifc-and-vr.md`** (load path, WASM, fragments worker). *Last updated: 2026-04-06 (§10 highlight tiers).*

---

## 1. Two visual systems (often used together)

| System | API | Role |
|--------|-----|------|
| **Fragment / model opacity** | `model.setOpacity`, `model.resetOpacity` | Whole model dimmed (**uniform ghost**), or per-id lift to **opacity 1** for selection / type groups. Talks to the **fragments worker**; heavy on large IFCs. |
| **Highlighter** (`@thatopen/components-front`) | `highlighter.highlightByID(styleName, modelIdMap, …)`, `highlighter.clear()` | Outlines / styles: **`select`** (click pick), **`bimFocus`** (programmatic nav focus), plus **custom style keys** for multi-color overlay groups. |

**Why both:** With uniform ghost alone, the **outline** from Highlighter could be hard to see or get wiped when materials resync. The MVP pattern is: **dim everything** → **Highlighter `bimFocus`** → **`setOpacity(focusIds, 1)`** so focused meshes read clearly (`applyFocusGhostHighlightOnly`).

If there is **no** Highlighter instance, the code falls back to **`fragments.highlight`** with a cyan-ish material (`IFC_FOCUS_HIGHLIGHT_HEX`).

---

## 2. Opacity intent (`FragmentOpacityIntent`)

- **`{ kind: "default" }`** — Full IFC materials (reset opacity path). Used after **stress mode** and when **`uniformGhost`** is off.
- **`{ kind: "uniform", opacity }`** — Same opacity for **all** geometry (baseline **~0.11** via `IFC_GHOST_OPACITY`), then selected ids elevated to **1**.

**`uniformGhost` prop** (parent, e.g. `/bim` URL `ghost=0|1`): mirrored in **`uniformGhostEnabledRef`**. When false, baseline intent is **default** (no global dim); focus can still use Highlighter.

**`baselineOpacityIntent(ctx)`** returns **default** if **`fragmentsOpacityStressRef`** is true or uniform ghost is disabled; otherwise **uniform** at `IFC_GHOST_OPACITY`.

---

## 3. “Stress mode” (`fragmentsOpacityStressRef`)

The fragments worker can throw **memory overflow** (message matches `/memory\s*overflow/i`). When that happens we set **`fragmentsOpacityStressRef.current = true`** (`markFragmentsOpacityStress`).

**While stress is true:**

- **`syncFragmentOpacityFromIntent`** skips bulk opacity work (logs “sync skipped: opacity stress”), still tries **`pumpFragmentsVisual`**.
- **`baselineOpacityIntent`** forces **`default`** (full materials) so the model stays usable without further worker pressure.
- Many paths (`touchUniformOpacityIfNeeded`, `elevateFocusedExpressIdsOpacity`, `applyConstructionVisibleExpressIds`, etc.) **no-op** or short-circuit.

**Cleared on:** new IFC load (`loadRunRef` effect sets `fragmentsOpacityStressRef.current = false` at start of each run).

**Recovery for users:** reload the page (or reload the model) after stress; there is no in-UI “reset stress” besides loading again.

Triggers include: **`resetOpacity`**, bulk **`setOpacity`**, **`setOpacityInChunks`**, **`highlightByID`**, **`fragments.highlight`**, **`applyWholeGraphAlphaMode`** sub-operations — any of these can surface worker limits on huge models.

---

## 4. Chunked `setOpacity`

Constants (tunable in source):

- **`IFC_SET_OPACITY_CHUNK_SIZE`** (512) — default slice for subset opacity.
- **`IFC_SET_OPACITY_CHUNK_SMALL`** (256) — when geometry id count is very large (>4000) for uniform ghost.
- **`IFC_SET_OPACITY_CHUNK_ACTIVE`** (2048) — elevating focus ids to 1.

**`setOpacityInChunks`** loops slices; on memory overflow it marks stress and returns failure.

Uniform ghost first tries **`model.setOpacity(undefined, opacity)`** (whole model one call); on failure it gathers **`getItemsIdsWithGeometry()`** and chunks.

---

## 5. Focus pipeline and sequencing

- **`ghostQueueRef`** — serializes async ghost/highlight work so concurrent **`setOpacity`** / highlight calls do not interleave.
- **`focusGenerationRef`** — invalidates stale focus jobs when `focusExpressId` / `focusExpressIds` change.
- **`sceneReadyForNavFocus`** — after load, **two `requestAnimationFrame`** ticks before treating the scene as ready for URL/sidebar focus (reduces races with first paint / initial opacity).

**Typical nav focus (subset):** camera **`setLookAt`** waits until movement completes, then **`applyFocusGhostHighlightOnly`** (dim → `highlightByID(bimFocus)` → elevate ids → pump).

**Orbit controls:** opacity is **not** reapplied every **`change`** event (that flooded the worker → overflow). **`controls` `rest`** (end of drag) and targeted **`touchUniformOpacityIfNeeded`** paths re-dim cheaply and **re-elevate** **`lastFocusElevateExpressIdsRef`**.

**Post-load fragment heartbeat:** for ~480 frames after the first successful ghost sync, the viewer pumps **`fragments.core.update(false)`** so tiles stream in while the camera may stay still. That path rematerializes opaque IFC often, so we **re-touch uniform ghost every `IFC_FRAGMENT_GHOST_RETICK_FRAMES`** (serialized through the ghost queue) and run **`reapplyUniformGhost` once** when the heartbeat ends. Returning to the tab (**`visibilitychange` → visible**) runs **`reapplyUniformGhost`** again. A literal “snapshot” of transparent materials is not exposed by the fragments pipeline; this keep-alive matches the intent without reloading the IFC.

---

## 6. Highlighter style names (conventions)

- **`select`** — reserved (click selection); do not reuse as overlay key.
- **`bimFocus`** — programmatic focus (`BIM_HIGHLIGHT_STYLE_FOCUS`); cleared separately from overlays via **`resetIfcHighlightOnly`**.
- **Custom keys** — **`BuildingIfcVisualGroup.styleKey`** for demo / multi-group overlays; **`reservedHighlighterStyleKey`** blocks `select` and `bimFocus`.

**That Open docs:** [Highlighter tutorial](https://docs.thatopen.com/Tutorials/Components/Front/Highlighter) — **`highlightByID`** API matches our usage.

---

## 7. Construction / timeline mode

**`constructionVisibleExpressIds`:** not the normal ghost. Sets uniform opacity **0** on the base, then **elevates only listed expressIds to 1** (no `bimFocus` highlight / camera fly). Skipped if stress or no `setOpacity`.

---

## 8. Debug and parent UI

- **`getAlphaDebugSnapshot`** / **`BuildingIfcAlphaDiagSnapshot`** — last intent kind, uniform ghost opacity, **`programmaticAlphaOn`**, last label + timestamp (`alphaDiagRef`).
- **`activateWholeGraphAlpha`**, **`resetFullVisuals`** — exposed via **`BuildingIfcViewerHandle`** for toolbar / debug.

Console prefixes: **`[BuildingIfcViewer][alpha]`**, **`[BuildingIfcViewer][focus-pipeline]`**.

---

## 9. “Snapshot” / instant geometry (clarification)

- **BCF / viewpoint “snapshots”** in That Open APIs are often **2D images** (PNG/JPEG), not a substitute for the full fragment mesh.
- **Instant load without traversing the IFC** would require a **pre-baked binary** (e.g. fragments export) served like the current IFC → loader path; this repo still loads **IFC bytes** → **IfcLoader** → **fragments** for the Building tab.
- **Passports** tab uses **`BimViewer3D`** (boxes), not this mesh pipeline — see PRD §2.2.

---

## 10. Highlight tiers (group size, URL, and which APIs should run)

**Goal:** Keep **express ids** and optional **group keys** in the URL as the stable “what’s selected,” but **vary the fragment workload** by how many ids are in play. The fragments worker does not scale to “all doors” with the same path as “one door.”

### 10.1 Data vs visuals

| Layer | Responsibility | Update frequency |
|--------|----------------|------------------|
| **Data** | `groupKey → expressId[]` (and optional `expressId → metadata`) from parse/KB/index | Build **once per IFC load** (or when the project’s model changes); URL only picks **group** and/or **expressId**. |
| **Visuals** | Ghost, `setOpacity` lifts, `highlightByID`, camera | **On selection change** only; must respect **stress mode** (§3) and never re-run bulk work on unrelated UI updates. |

### 10.2 Tier policy (defaults for implementation)

Constants below are **product defaults**—wire them as named values in code when tiering is implemented; chunk sizes in §4 remain separate tuning knobs.

| Tier | Typical case | Approx. id count (with geometry) | Uniform ghost (`ghost=1`) | Per-id `setOpacity(…, 1)` lift | `highlightByID` (`bimFocus` or overlay style) | Camera |
|------|----------------|----------------------------------|----------------------------|--------------------------------|-----------------------------------------------|--------|
| **A — Focus** | Single element, small multi-select | **≤ 32** | Allowed if URL/parent enables ghost | **Yes** — full `applyFocusGhostHighlightOnly` | **Yes** | Fly to merged bbox of focus ids |
| **B — Group** | Floor, wing, modest subset | **33–256** | **Prefer off** (`ghost=0`) or keep ghost **without** lifting every id | **No** (or cap lifts to Tier A size and log) | **Yes** — one `ModelIdMap` per style; avoid repeated clear/highlight loops | Fit bbox of **highlighted** ids only if count is acceptable; else gentle zoom or no auto-zoom |
| **C — Type-wide** | All `IfcDoor`, all windows, etc. | **> 256** | **Off** | **No** | **Capped** — e.g. highlight first **64** ids; UI shows “showing 64 of *n*” OR skip mesh highlight and use **Passports / `BimViewer3D`** for overview | **No** auto fly-to-merged-box on huge sets (bbox/merge too heavy) |

**Rules:**

1. **Stress mode** overrides everything: if `fragmentsOpacityStressRef` is true, only **default** materials + minimal Highlighter attempts (see existing short-circuits in `BuildingIfcViewer.tsx`).
2. **`highlightByID` is not free** at scale (§3 triggers). Tier C must not pass unbounded `Set` sizes; cap or split across frames only if That Open APIs stay stable (prefer cap + honest UI).
3. **Abstract vs mesh:** Tier C can **deep-link** to a single `expressId` for full mesh focus (Tier A) while the type-wide view stays list or box view — see PRD §2.2.

### 10.3 URL contract (informal)

- **`expressId`** — primary mesh focus when present (Tier A behavior when alone).
- **`group`** (or equivalent) — resolves to id list via **cached** map; tier is derived from **resolved count**, not from string length.
- **`ghost`** — when `0`, baseline opacity stays **default**; large groups should default or coerce to Tier B/C behavior even if user toggles ghost on (implementation choice: clamp or ignore ghost for huge sets).

### 10.4 Implementation status

Tiering is implemented: **`src/lib/ifc-highlight-tiers.ts`** (thresholds + caps; optional **`relaxThroughTierB`** on `effectiveUniformGhostForTier` for small-surface UIs), **`BuildingIfcViewer.tsx`** (bbox subset in tier C, Highlighter cap, per-id opacity lift whenever uniform baseline is active — not tier-A-only), **`PassportIfcMiniPreview`** sets **`alphaBaselineIgnoreHighlightTier`** so tier **B** groups still get baseline dim + lift on the passports canvas (tier **C** unchanged). After each nav-focus job, two delayed **`touchUniformOpacityIfNeeded`** calls (ghost queue) help when fragments rematerialize opaque slightly after highlight. **`applyVisualGroupsOverlay`** caps groups larger than tier B, **`bim/page.tsx`** banner for tier B/C material groups. See [`docs/building-ifc-viewer-opacity-tier-implementation.md`](building-ifc-viewer-opacity-tier-implementation.md).

**Workflow / Building deep links:** URLs with `from=workflow` and Building view default to **`ghost=0`** (solid materials) when `ghost` is omitted, and the page **rewrites** the query to add `ghost=0` so uniform ghost does not run a full-model `setOpacity` pass on huge IFCs (fragments worker memory overflow). **`bimBuildingElementHref`** always includes `ghost=0`. Nav focus is **debounced** (~200ms) to reduce overload when clicking rapidly.

---

## 11. Related files

| File | Notes |
|------|--------|
| `BuildingIfcViewer.tsx` | All logic above |
| `src/app/bim/page.tsx` | `uniformGhost` / URL `ghost`, `focusExpressId`, `visualGroups`, material-slug visualizer |
| `PassportIfcMiniPreview.tsx` | Embeds Building viewer for passport context |
| `docs/PRD-browser-3d-ifc-and-vr.md` | Stack, WASM, worker, abstract vs building |

**Highlight tiers (§10):** add tier resolution + caps where `focusExpressIds` / `visualGroups` are built (`bim/page.tsx`, passport panels, workflow deep links).
