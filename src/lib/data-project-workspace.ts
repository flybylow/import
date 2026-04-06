import fs from "fs";
import path from "path";

import { isSafeProjectId, pipelineArtifactNames } from "@/lib/clean-pipeline-artifacts";

/**
 * Filename suffixes under `data/` that imply a workspace id (longest first so `-calc-latest.json`
 * wins over `-calc.ttl`).
 */
const PROJECT_FILE_SUFFIXES: readonly string[] = [
  "-calc-latest.json",
  "-passport-quantity-overrides.json",
  "-bestek-material-matching.json",
  "-phase0-element-groups.json",
  "-bestek-bindings.json",
  "-product-coupling.json",
  "-compliance-events.ttl",
  "-enriched.ttl",
  "-translated.ttl",
  "-timeline.ttl",
  "-deliveries.ttl",
  "-kb.ttl",
  "-calc.ttl",
];

export function extractProjectIdFromDataEntryName(name: string): string | null {
  for (const suf of PROJECT_FILE_SUFFIXES) {
    if (name.endsWith(suf)) {
      const id = name.slice(0, -suf.length);
      return id.length > 0 ? id : null;
    }
  }
  if (name.endsWith(".ifc")) {
    const id = name.slice(0, -4);
    return id.length > 0 ? id : null;
  }
  if (name.endsWith(".ttl")) {
    const base = name.slice(0, -4);
    if (!base.includes("-")) return base.length > 0 ? base : null;
  }
  if (name.endsWith("-calc-history")) {
    const id = name.slice(0, -"-calc-history".length);
    return id.length > 0 ? id : null;
  }
  return null;
}

/** All known single-file artifacts for a workspace id (under `data/`). */
export function projectWorkspaceRelativeFilePaths(projectId: string): string[] {
  return [
    `${projectId}.ifc`,
    ...pipelineArtifactNames(projectId),
    `${projectId}-timeline.ttl`,
    `${projectId}-deliveries.ttl`,
    `${projectId}-phase0-element-groups.json`,
    `${projectId}-bestek-bindings.json`,
    `${projectId}-product-coupling.json`,
    `${projectId}-bestek-material-matching.json`,
    `${projectId}-passport-quantity-overrides.json`,
    `${projectId}-compliance-events.ttl`,
  ];
}

export function projectCalcHistoryDirName(projectId: string): string {
  return `${projectId}-calc-history`;
}

function dirByteSizeSync(absDir: string): number {
  let total = 0;
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(absDir);
  return total;
}

export type DataProjectSummary = {
  id: string;
  presentFiles: string[];
  hasCalcHistoryDir: boolean;
  totalBytes: number;
};

export function discoverProjectIdsInDataDir(dataDir: string): string[] {
  const set = new Set<string>();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    const id = extractProjectIdFromDataEntryName(ent.name);
    if (id && isSafeProjectId(id)) set.add(id);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function summarizeProjectWorkspace(projectId: string, cwd = process.cwd()): DataProjectSummary {
  const dataDir = path.join(cwd, "data");
  const presentFiles: string[] = [];
  let totalBytes = 0;
  for (const rel of projectWorkspaceRelativeFilePaths(projectId)) {
    const abs = path.join(dataDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      presentFiles.push(rel);
      totalBytes += fs.statSync(abs).size;
    }
  }
  const histAbs = path.join(dataDir, projectCalcHistoryDirName(projectId));
  let hasCalcHistoryDir = false;
  if (fs.existsSync(histAbs) && fs.statSync(histAbs).isDirectory()) {
    hasCalcHistoryDir = true;
    totalBytes += dirByteSizeSync(histAbs);
  }
  return { id: projectId, presentFiles, hasCalcHistoryDir, totalBytes };
}

export type DeleteProjectWorkspaceResult = {
  projectId: string;
  removedFiles: string[];
  removedDirs: string[];
  missingFiles: string[];
};

/** Removes all known workspace files and the calc history directory. */
export function deleteProjectWorkspace(projectId: string, cwd = process.cwd()): DeleteProjectWorkspaceResult {
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }
  const dataDir = path.join(cwd, "data");
  const removedFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const rel of projectWorkspaceRelativeFilePaths(projectId)) {
    const abs = path.join(dataDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      fs.unlinkSync(abs);
      removedFiles.push(`data/${rel}`);
    } else {
      missingFiles.push(`data/${rel}`);
    }
  }
  const removedDirs: string[] = [];
  const histAbs = path.join(dataDir, projectCalcHistoryDirName(projectId));
  if (fs.existsSync(histAbs) && fs.statSync(histAbs).isDirectory()) {
    fs.rmSync(histAbs, { recursive: true, force: true });
    removedDirs.push(`data/${projectCalcHistoryDirName(projectId)}`);
  }
  return { projectId, removedFiles, removedDirs, missingFiles };
}
