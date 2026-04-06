/** Client-safe manifest shape returned by GET /api/lab/as-planned-ifc (no repo paths). */

export const AS_PLANNED_MANIFEST_API = "/api/lab/as-planned-ifc";

export type AsPlannedSnapshotClient = {
  id: string;
  label: string;
  fileName: string;
  approxIsoDate: string | null;
};

export type AsPlannedManifestClient = {
  datasetId: string;
  description?: string;
  defaultSnapshotId: string;
  snapshots: AsPlannedSnapshotClient[];
};
