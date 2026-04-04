import fs from "fs";
import path from "path";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";

export function deliveriesIngestTtlPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-deliveries.ttl`);
}

/**
 * Append a Turtle block from a deliveries ingest run (append-only audit / KG sidecar).
 */
export function appendDeliveriesIngestTurtle(args: {
  projectId: string;
  turtle: string;
  /** Shown in the leading comment (e.g. afleverbon id). */
  note?: string;
  cwd?: string;
}): { relPath: string; absPath: string } {
  const { projectId, turtle, note, cwd = process.cwd() } = args;
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }
  const absPath = deliveriesIngestTtlPath(projectId, cwd);
  const relPath = `data/${projectId}-deliveries.ttl`;
  const stamp = new Date().toISOString();
  const label = note?.trim() ? ` ${note.trim()}` : "";
  const header = `\n# Deliveries ingest ${stamp}${label}\n`;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.appendFileSync(absPath, `${header}${turtle.trim()}\n`, "utf-8");
  return { relPath, absPath };
}
