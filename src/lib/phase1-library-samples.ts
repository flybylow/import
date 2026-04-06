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
  lcaReview: {
    key: "lcaReview",
    label: "LCA stakeholder review (narrative timeline + Schependomlaan IFC)",
    dataFile: "IFC Schependomlaan.ifc",
    suggestedProjectId: "lca-stakeholder-review",
  },
  /** buildingSMART IFC4 annex E wall standard case (tiny geometry + layers). */
  communityWall: {
    key: "communityWall",
    label: "Wall standard case (IFC4 annex, ~3 KB)",
    dataFile: "community-wall-standard-case.ifc",
    suggestedProjectId: "community-wall-standard",
  },
} as const;

export type Phase1LibrarySampleKey = keyof typeof PHASE1_LIBRARY_SAMPLES;

export const PHASE1_LIBRARY_SAMPLE_KEYS = Object.keys(
  PHASE1_LIBRARY_SAMPLES
) as Phase1LibrarySampleKey[];

/** Resolves API/client `sample` strings (any casing) to a library key. */
export function resolvePhase1LibrarySampleKey(raw: string): Phase1LibrarySampleKey {
  const k = raw.trim().toLowerCase().replace(/[-_\s]/g, "");
  if (k === "small") return "small";
  if (k === "lcareview") return "lcaReview";
  if (k === "communitywall" || k === "isowall" || k === "wallstandard") return "communityWall";
  return "schependomlaan";
}
