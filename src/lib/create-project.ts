import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { isSafeProjectId, pipelineArtifactNames } from "@/lib/clean-pipeline-artifacts";
import { timelineTtlPath } from "@/lib/timeline/append-event";
import { timelineFilePrefixes } from "@/lib/timeline-events";

export function slugifyProjectLabel(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "project";
}

export function generateUniqueProjectId(): string {
  return `p-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function anyProjectArtifactExists(projectId: string, cwd = process.cwd()): boolean {
  const dataDir = path.join(cwd, "data");
  const names = new Set<string>([`${projectId}-timeline.ttl`, ...pipelineArtifactNames(projectId)]);
  for (const n of names) {
    if (fs.existsSync(path.join(dataDir, n))) return true;
  }
  return false;
}

export function allocateProjectId(
  opts: { explicitId?: string; fromLabel?: string },
  cwd = process.cwd()
): { ok: true; projectId: string } | { ok: false; error: string } {
  const explicit = opts.explicitId?.trim();
  if (explicit) {
    if (!isSafeProjectId(explicit)) {
      return { ok: false, error: "Invalid projectId (use letters, digits, hyphen, underscore; max 80 chars)" };
    }
    return { ok: true, projectId: explicit };
  }

  const label = opts.fromLabel?.trim();
  if (label) {
    let base = slugifyProjectLabel(label);
    let candidate = base;
    let guard = 0;
    while (anyProjectArtifactExists(candidate, cwd) && guard < 40) {
      guard += 1;
      const tail = randomUUID().replace(/-/g, "").slice(0, 6);
      const suffix = `-${tail}`;
      candidate = (base.slice(0, Math.max(1, 80 - suffix.length)) + suffix).replace(/-+$/, "") || `p-${tail}`;
    }
    if (anyProjectArtifactExists(candidate, cwd)) {
      return { ok: false, error: "Could not allocate a unique id; try a different label" };
    }
    return { ok: true, projectId: candidate };
  }

  let id = generateUniqueProjectId();
  let g = 0;
  while (anyProjectArtifactExists(id, cwd) && g < 30) {
    g += 1;
    id = generateUniqueProjectId();
  }
  if (anyProjectArtifactExists(id, cwd)) {
    return { ok: false, error: "Could not allocate a unique id" };
  }
  return { ok: true, projectId: id };
}

/**
 * Creates `data/<projectId>-timeline.ttl` with prefixes only (no events).
 * Fails if any pipeline or timeline artifact for `projectId` already exists.
 */
export function createEmptyTimelineProject(
  projectId: string,
  cwd = process.cwd()
): { ok: true; timelineRelPath: string } | { ok: false; error: string; status: 409 | 400 } {
  if (!isSafeProjectId(projectId)) {
    return { ok: false, error: "Invalid projectId", status: 400 };
  }
  if (anyProjectArtifactExists(projectId, cwd)) {
    return {
      ok: false,
      error: "Workspace already exists for this projectId (timeline or pipeline files under data/)",
      status: 409,
    };
  }
  const abs = timelineTtlPath(projectId, cwd);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, timelineFilePrefixes(), "utf-8");
  return { ok: true, timelineRelPath: `data/${projectId}-timeline.ttl` };
}
