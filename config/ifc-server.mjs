/**
 * Server-side IFC pipeline (single source of truth for limits wired into Next + routes).
 *
 * Flow:
 * 1. `POST /api/parse` — `request.formData()` → full file in memory as `Uint8Array`.
 * 2. `assertIfcStepPhysicalFile` in `src/lib/ifc-parser.ts` — reject LFS pointers, ZIP/IFCZIP,
 *    UTF-16 STEP, missing `ISO-10303-21` within the scanned prefix.
 * 3. `parseIfcPhase1` — **web-ifc** `IfcAPI` with WASM from `public/wasm/` (`SetWasmPath`).
 * 4. On success — write `data/<uuid>.ifc` for `/api/file` and downstream tools.
 *
 * Next.js buffers each request body for cloning (`attachRequestMeta` → `getCloneableBody`).
 * Default `experimental.proxyClientMaxBodySize` is **10MB**; IFCs are often 20–200MB+, so uploads
 * were truncated without a clear error. This file’s byte cap must match that setting.
 *
 * @see src/lib/ifc-parser.ts
 * @see src/app/api/parse/route.ts
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
 */

/** Max decoded IFC file size we accept on `POST /api/parse` (must match `proxyClientMaxBodySize`). */
export const IFC_PROXY_CLIENT_MAX_BODY_BYTES = 200 * 1024 * 1024; // 200 MiB

/** Large models can spend minutes in web-ifc + spatial walk; platforms use this as a hint. */
export const IFC_PARSE_ROUTE_MAX_DURATION_SEC = 300;

/** Bytes scanned for `ISO-10303-21` after LFS/ZIP/UTF-16 checks (`assertIfcStepPhysicalFile`). */
export const IFC_STEP_HEADER_SCAN_MAX_BYTES = 256 * 1024;
