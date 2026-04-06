import fs from "fs";
import path from "path";

/** One row from `data/schependomlaan-as-planned-snapshots.json`. */
export type SchependomlaanAsPlannedSnapshotEntry = {
  id: string;
  label: string;
  fileName: string;
  /** Repo-relative path; must stay under `docs/DataSetArch/`. */
  repoPath: string;
  approxIsoDate: string | null;
};

export type SchependomlaanAsPlannedSnapshotManifest = {
  datasetId: string;
  description?: string;
  defaultSnapshotId: string;
  snapshots: SchependomlaanAsPlannedSnapshotEntry[];
};

const MANIFEST_FILENAME = "schependomlaan-as-planned-snapshots.json";

function manifestAbsolutePath(cwd: string): string {
  return path.join(cwd, "data", MANIFEST_FILENAME);
}

export function loadSchependomlaanAsPlannedManifest(cwd: string = process.cwd()): SchependomlaanAsPlannedSnapshotManifest {
  const abs = manifestAbsolutePath(cwd);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing ${path.join("data", MANIFEST_FILENAME)}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf-8")) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("Invalid manifest JSON");
  const m = raw as Record<string, unknown>;
  if (typeof m.datasetId !== "string" || !Array.isArray(m.snapshots)) {
    throw new Error("Invalid manifest shape");
  }
  for (const s of m.snapshots) {
    if (!s || typeof s !== "object") throw new Error("Invalid snapshot row");
    const row = s as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.repoPath !== "string") {
      throw new Error("Snapshot missing id or repoPath");
    }
    if (row.repoPath.includes("..")) {
      throw new Error(`Snapshot ${row.id}: repoPath must not contain ..`);
    }
  }
  return raw as SchependomlaanAsPlannedSnapshotManifest;
}

/** Strips `repoPath` for browser clients. */
export function manifestForClient(m: SchependomlaanAsPlannedSnapshotManifest) {
  return {
    datasetId: m.datasetId,
    description: m.description,
    defaultSnapshotId: m.defaultSnapshotId,
    snapshots: m.snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      fileName: s.fileName,
      approxIsoDate: s.approxIsoDate,
    })),
  };
}

function isPathInsideDataSetArch(cwd: string, absoluteFile: string): boolean {
  const base = path.resolve(path.join(cwd, "docs", "DataSetArch"));
  const resolved = path.resolve(absoluteFile);
  const rel = path.relative(base, resolved);
  if (rel === "") return true;
  return !rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel);
}

/**
 * Resolves manifest `repoPath` to an absolute path only if it lies under `docs/DataSetArch/`.
 */
export function resolveSnapshotAbsolutePath(
  cwd: string,
  entry: SchependomlaanAsPlannedSnapshotEntry
): string | null {
  const abs = path.normalize(path.join(cwd, entry.repoPath));
  if (!isPathInsideDataSetArch(cwd, abs)) return null;
  return abs;
}

export function getSnapshotById(
  manifest: SchependomlaanAsPlannedSnapshotManifest,
  id: string
): SchependomlaanAsPlannedSnapshotEntry | undefined {
  return manifest.snapshots.find((s) => s.id === id.trim());
}
