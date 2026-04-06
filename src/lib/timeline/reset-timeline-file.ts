import fs from "fs";
import path from "path";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { timelineTtlPath } from "@/lib/timeline/append-event";
import { timelineFilePrefixes } from "@/lib/timeline-events";

/**
 * Rewrites `data/<projectId>-timeline.ttl` to prefix declarations only (no `timeline:AuditEvent` blocks).
 * Creates the file if missing. Same starting state as a new empty timeline project.
 */
export function resetTimelineFileToPrefixesOnly(
  projectId: string,
  cwd = process.cwd()
): { relPath: string; absPath: string; created: boolean } {
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }
  const absPath = timelineTtlPath(projectId, cwd);
  const relPath = `data/${projectId}-timeline.ttl`;
  const created = !fs.existsSync(absPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, timelineFilePrefixes(), "utf-8");
  return { relPath, absPath, created };
}
