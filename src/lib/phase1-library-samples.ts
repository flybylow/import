/**
 * Bundled IFC files under `data/` for Phase 1 “sample library” import.
 * Keys are sent as `sample` on `POST /api/run-example`.
 */
export const PHASE1_LIBRARY_SAMPLES = {
  schependomlaan: {
    key: "schependomlaan",
    label: "Schependomlaan (large demo)",
    /** Filename inside `data/` */
    dataFile: "IFC Schependomlaan.ifc",
    suggestedProjectId: "schependomlaan-2015",
  },
  small: {
    key: "small",
    label: "Small building (~400 KB)",
    dataFile: "ifc-sample-small.ifc",
    suggestedProjectId: "sample-building",
  },
} as const;

export type Phase1LibrarySampleKey = keyof typeof PHASE1_LIBRARY_SAMPLES;

export const PHASE1_LIBRARY_SAMPLE_KEYS = Object.keys(
  PHASE1_LIBRARY_SAMPLES
) as Phase1LibrarySampleKey[];

export function isPhase1LibrarySampleKey(
  v: string
): v is Phase1LibrarySampleKey {
  return v === "schependomlaan" || v === "small";
}
