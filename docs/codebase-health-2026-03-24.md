# Codebase health notes (2026-03-24)

Lessons from a full-repo pass: lint, `tsc --noEmit`, API/path patterns, and fixes applied the same day.

## TypeScript fixes applied

### Calculate page — grouped display rows

**Issue:** `displayRows` grouped branch used a `Map` value type without `materialIds`, but the code initializes and updates `materialIds` and reads it when mapping to the final row shape. TypeScript correctly flagged access on a union that omitted that field.

**Fix:** Add `materialIds: number[]` to the `grouped` `Map` value type in `src/app/calculate/page.tsx` so both the `materialId` grouping branch and the aggregated branch share a consistent row shape.

### Building IFC viewer — camera `change` event

**Issue:** `world.camera.controls.addEventListener("change", …)` failed typing: `CameraControlsEventMap` from the That Open stack does not list `"change"`, even though controls behave like typical Three.js controls and emit it at runtime.

**Fix:** Register listeners through a small `ControlsWithChange` structural type (cast via `unknown`) in `src/features/bim-viewer/components/BuildingIfcViewer.tsx`, with a one-line comment explaining the mismatch. Cleanup uses the same handle for `removeEventListener`.

## Recurring themes to track

- **`projectId` and disk paths:** `isSafeProjectId` in `src/lib/clean-pipeline-artifacts.ts` is enforced only on `/api/clean-pipeline`. Other routes interpolate `projectId` into `path.join(process.cwd(), "data", …)`. For any non-local deployment, validate the same pattern everywhere to avoid path traversal (e.g. `../` in `projectId`).
- **Duplicated RDF helpers:** `getLitValue`, `safeNum`, and similar appear in multiple `kb` API routes; a shared `src/lib/rdf-helpers.ts` (or similar) would reduce drift.
- **`any` at API boundaries:** Prefer `unknown` plus validation for JSON bodies and narrower types for `rdflib` terms where practical.
- **CI signal:** `npm run lint` was clean except one hooks warning (`src/app/bim-debug/page.tsx`). Running `tsc --noEmit` in CI or as an npm script catches issues that may not surface the same way as `next build` alone.

## Reference

- Strict project id helper: `isSafeProjectId` in `src/lib/clean-pipeline-artifacts.ts`
- Safe file download pattern: `src/app/api/file/route.ts` (`safeJoinDataFile`)
