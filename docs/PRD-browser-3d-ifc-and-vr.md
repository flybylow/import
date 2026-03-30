# PRD: Browser 3D (IFC) and VR integration

This document is a **product/requirements-style handoff** for loading a **building IFC** in the browser and, separately, **bringing the same visual into a VR context** (e.g. another Next.js or Three.js project). It consolidates **what this repo implements**, **which docs apply**, **framework choices**, and **pitfalls we already hit** (and how they were addressed).

---

## 1. Goals

| Goal | In this repo today | In “another project” (VR) |
|------|-------------------|---------------------------|
| Show **real IFC geometry** in the browser | Yes — `/bim` **Building** view (`BuildingIfcViewer`) | Reuse the same pipeline: **Three.js scene** + **That Open Components** + **web-ifc** + **Fragments worker** |
| **Walk / orbit** the model | Yes — That Open **SimpleCamera** + controls | Same, or replace with **WebXR** camera rig |
| **VR / immersive** session | **Not implemented** | Add **WebXR** (`renderer.xr`) on top of the **same** `THREE.WebGLRenderer` / scene graph |

---

## 2. Architecture in this repository

### 2.1 Full IFC viewer stack

The production IFC path is **`BuildingIfcViewer`**:

- **React** (client component) mounts a **div**; no canvas in JSX — the viewer creates the WebGL canvas and attaches it to the container.
- **@thatopen/components** (`OBC`) wires:
  - **Worlds** → **SimpleScene**, **SimpleRenderer**, **SimpleCamera**
  - **IfcLoader** — parses IFC bytes with **web-ifc** (WASM)
  - **FragmentsManager** — converts/holds **fragments** geometry (worker-backed), LOD/culling
- **three** (`THREE`) — scene graph, lights, bbox framing, `AxesHelper`.
- **web-ifc** — IFC parsing in the browser via **WASM** files served from **`/public/wasm/`** (not from a remote CDN).

**IFC bytes source:**

- **Project file:** `GET /api/file?name=<projectId>.ifc` → streams `data/<projectId>.ifc` (see `src/app/api/file/route.ts`; path traversal blocked).
- **Smoke test:** `GET /ifc/test.ifc` → `public/ifc/test.ifc`.

**Fragments worker:**

- **Not** loaded from `node_modules` in the browser directly. **`GET /api/fragments-worker`** reads `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` and returns it as JS (`src/app/api/fragments-worker/route.ts`).
- **IfcLoader** is configured with `fragments.init(\`${origin}/api/fragments-worker\`)` so the worker URL is **same-origin** (avoids CORS issues).

**WASM:**

- Files copied under **`public/wasm/`**: `web-ifc.wasm`, `web-ifc-mt.wasm` (from `node_modules/web-ifc/`).
- Loader uses **`autoSetWasm: false`**, **`wasm.path`** = `${origin}/wasm/`, **`absolute: true`**, plus **`customLocateFileHandler`** so `mt` vs non-`mt` resolve correctly.
- **Explicit `webIfc.Init()`** after `ifcLoader.setup()` — we do **not** rely on lazy init inside `load()` (see pitfalls).

### 2.2 “Abstract” 3D on Calculate (not full IFC mesh)

**`BimViewer3D`** + **`PassportModelView`** use **plain Three.js** (`OrbitControls`, **boxes** per element) driven by **Phase 3 passport data** (`expressId`, label, optional height). This is an **MVP abstraction** for linking UI to elements — **not** the IFC mesh. For VR with the **real building**, use the **BuildingIfcViewer** path (or replicate its scene setup).

### 2.3 Next.js configuration that affects 3D

- **`reactStrictMode: false`** in `next.config.mjs` — avoids **double-mounting** client viewers in dev (Strict Mode would run effects twice and **load IFC / WebGL twice**, which is painful for heavy models).

---

## 3. Dependencies (versions as in `package.json`)

| Package | Role |
|---------|------|
| `three` | Core 3D; used directly and via That Open |
| `@thatopen/components` | IfcLoader, FragmentsManager, Worlds, SimpleRenderer, etc. |
| `web-ifc` | IFC WASM runtime (paired with files in `public/wasm/`) |
| `@thatopen/components-front` | Present in deps (That Open front helpers; main viewer imports `@thatopen/components`) |

**Not in this repo:** `@react-three/fiber`, `@react-three/drei`, `three-stdlib` WebXR helpers — add these **only if** you adopt a React-three wrapper for VR.

---

## 4. Pitfalls we hit — and fixes

### 4.1 WASM: CDN / CORS / version skew

**Problem:** Loading WASM from a CDN or wrong path causes **runtime failures** or **version mismatch** with the JS glue.

**Fix:** Serve **`web-ifc*.wasm` from `/wasm/`** on the app origin; **`HEAD`** check before init; **`customLocateFileHandler`** for `mt` variant.

### 4.2 Next.js / Turbopack and `web-ifc.Init()`

**Problem:** Relying on **lazy init** inside `IfcLoader.load()` can **race** and fail in the browser.

**Fix:** After `ifcLoader.setup()`, get **`webIfc`** from the loader, call **`SetWasmPath`** if available, then **`await webIfc.Init()`**, then a **short delay** (~2s in current code) before **`OpenModel` / load** so the Emscripten runtime settles.

### 4.3 Fragments: empty scene / lazy meshes

**Problem:** Model object **`children` can stay empty** while fragments **tiles** stream; bbox may be empty if framed too early.

**Fixes in code:**

- Attach models on **`fragments.list.onItemSet`** and **`onFragmentsLoaded`**.
- **`model.useCamera(world.camera.three)`** when available.
- **Loop `fragments.core.update(true)` + `model.update(true)`** until children appear or not busy.
- **RAF heartbeat** for ~480 frames to pump fragment updates after load.
- **Optional wait loop** if `getItemsIdsWithGeometry()` reports items but children are still empty.
- **Auto-frame** with **`Box3.setFromObject(model.object)`** after geometry appears.

### 4.4 Load time / timeouts

**Problem:** Large or degenerate IFC can exceed patience or hang.

**Fix:** User-facing **stall messages** (12s, 30s+); **`Promise.race`** with **120s** timeout on `ifcLoader.load`; progress callback surfaces **entity counts** in the status line.

### 4.5 React Strict Mode double load

**Problem:** Strict Mode remounts effects → **two** viewers / **two** loads.

**Fix:** **`reactStrictMode: false`** for this app.

### 4.6 Fast Refresh / duplicate canvases

**Problem:** Remounting leaves stale DOM.

**Fix:** **`container.replaceChildren()`** before init and on cleanup; **`dispose()`** on `components`; increment **`loadRunRef`** / **`disposed`** guard.

### 4.7 TypeScript: camera `change` event

**Problem:** That Open’s **`CameraControls`** typings omit **`"change"`** even though runtime emits it (like Three orbit controls).

**Fix:** Cast to a small **`ControlsWithChange`** type (`unknown` bridge) for **`addEventListener("change", …)`** and cleanup — see `docs/codebase-health-2026-03-24.md`.

### 4.8 Deprecation noise

**Problem:** **`THREE.Clock` deprecation** spam in console.

**Fix:** Temporary **`console.warn` filter** for that specific message in `BuildingIfcViewer` (narrow; restore on cleanup).

---

## 5. Related documentation in `docs/`

| Doc | Relevance to 3D / IFC |
|-----|------------------------|
| `bim-to-kg-journey.md` | **Pipeline** Phases 1–3, artifacts, **`/api/pipeline/trace`** — not viewer-specific but explains **where `data/<projectId>.ifc` fits** in the product |
| `codebase-health-2026-03-24.md` | **Camera `change` listener** typing fix |
| `PRD-SUMMARY.md` | Older PRD: **server-side parse** with web-ifc; current **browser** viewer is **additional** to that story |
| `BASE.md` | Running log of conventions; search for **BIM**, **passport**, **graph** |

---

## 6. Checklist: reproduce “IFC in browser” in a new project

1. **Install:** `three`, `@thatopen/components`, `web-ifc` (align versions with a known-good combo from this repo’s `package.json`).
2. **Copy WASM** from `node_modules/web-ifc/*.wasm` into **`public/wasm/`** (or your static host equivalent).
3. **Expose Fragments worker** — either copy **That Open**’s `worker.mjs` to `public/` or proxy like **`/api/fragments-worker`** (same-origin).
4. **Serve IFC** — static URL or API route; **avoid** cross-origin WASM/IFC unless CORS is correct.
5. **Initialize** with **`webIfc.Init()`** after **`ifcLoader.setup()`** (see §4.2).
6. **Pump** fragments updates until geometry is visible (see §4.3).
7. **Consider** disabling React Strict Mode in dev for heavy WebGL, or harden cleanup/idempotency.

---

## 7. VR (WebXR) — not in this repo; how to add in another project

This repo **does not** enable **`renderer.xr`** or immersive sessions. To **test VR with the same building** elsewhere:

### 7.1 Technical approach

1. **Use the same renderer pipeline** — After `SimpleRenderer` is created, obtain the underlying **`THREE.WebGLRenderer`** (That Open exposes it on the world/renderer; check current `@thatopen/components` API for **`renderer.three`** or equivalent).
2. **Enable WebXR:** `renderer.xr.enabled = true` and use **`navigator.xr.requestSession('immersive-vr', …)`** or Three’s **`WebXRManager`** patterns.
3. **Session requirements:** **HTTPS** (or localhost) for WebXR; user gesture to enter VR; handle **session end** and **resize**.

### 7.2 Integration patterns

| Pattern | Pros | Cons |
|---------|------|------|
| **Raw Three.js** + `renderer.xr` | Full control; matches this repo’s style | More boilerplate |
| **`@react-three/fiber` + `@react-three/xr`** | Faster UI iteration | Another abstraction; must bridge That Open’s non-R3F scene |
| **Export glTF** from IFC offline, load in A-Frame / R3F | Decouples heavy IFC parse from VR runtime | Extra pipeline step; fidelity/updates |

**Pragmatic path for “another project”:** Either **embed the same `BuildingIfcViewer` logic** in that app (copy module + public assets + API routes), or **factor shared code** into a small internal package: **WASM + worker URL + IfcLoader init sequence**.

### 7.3 VR-specific pitfalls (general industry)

- **Performance:** Large IFC → **high triangle count**; use **fragments/LOD** (already the That Open path) or simplify offline.
- **Scale:** IFC units are often **meters** — confirm **world scale** matches **XR reference space** (floor at y=0, etc.).
- **Controls:** Replace **orbit** with **teleport / smooth locomotion** as needed; watch **simulator sickness**.
- **Quest / browser:** Meta Browser / Chromium WebXR **quirks**; test **enter VR** from **user tap**.

---

## 8. Success criteria (for this PRD)

- A developer can **list required assets** (WASM, worker, IFC URL) and **initialization order** without reading source first.
- A developer can **port** the viewer to another app **or** add **WebXR** knowing this repo **does not** ship VR but **does** ship a **complete browser IFC → Three** path.
- **Pitfalls** from production debugging are **searchable** in one place (§4 + `docs/codebase-health-2026-03-24.md`).

---

## 9. Key source files (reference)

| File | Purpose |
|------|---------|
| `src/features/bim-viewer/components/BuildingIfcViewer.tsx` | Full IFC + That Open + fragments + framing |
| `src/components/BimViewer3D.tsx` | Abstract boxes (passport UI), pure Three |
| `src/app/api/fragments-worker/route.ts` | Serves Fragments `worker.mjs` |
| `src/app/api/file/route.ts` | Serves `data/*` IFC for the viewer |
| `next.config.mjs` | `reactStrictMode: false` for WebGL |
| `public/wasm/web-ifc*.wasm` | Browser WASM binaries |

---

*Last updated: 2026-03-24 — aligned with `bimimport` main branch behavior; VR section is advisory for external projects.*
