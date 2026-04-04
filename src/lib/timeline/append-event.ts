import fs from "fs";
import path from "path";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import {
  timelineEventToTurtle,
  timelineFilePrefixes,
  type TimelineEventPayload,
} from "@/lib/timeline-events";

export function timelineTtlPath(projectId: string, cwd = process.cwd()): string {
  return path.join(cwd, "data", `${projectId}-timeline.ttl`);
}

export function appendTimelineAuditEvent(
  projectId: string,
  payload: TimelineEventPayload,
  cwd = process.cwd()
): { relPath: string; absPath: string } {
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }

  const absPath = timelineTtlPath(projectId, cwd);
  const relPath = `data/${projectId}-timeline.ttl`;
  const block = timelineEventToTurtle(payload);

  let toWrite = `\n# AuditEvent ${payload.timestampIso} eventId=${payload.eventId}\n${block}`;
  if (!fs.existsSync(absPath) || fs.statSync(absPath).size === 0) {
    toWrite = timelineFilePrefixes() + toWrite.trimStart();
  }

  fs.appendFileSync(absPath, toWrite, "utf-8");
  return { relPath, absPath };
}
