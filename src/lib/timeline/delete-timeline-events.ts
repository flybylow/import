import fs from "fs";

import { isSafeProjectId } from "@/lib/clean-pipeline-artifacts";
import { timelineTtlPath } from "@/lib/timeline/append-event";
import {
  compareParsedTimelineEventsAsc,
  parseTimelineTtl,
  parsedTimelineEventToPayload,
  timelineEventToTurtle,
  timelineFilePrefixes,
  type ParsedTimelineEvent,
} from "@/lib/timeline-events";

/** Timeline `eventId` literals are UUIDs or similar opaque ids (no path traversal). */
export function isSafeTimelineEventId(eventId: string): boolean {
  const s = eventId.trim();
  return /^[-a-zA-Z0-9_]{1,128}$/.test(s);
}

const MAX_BATCH_DELETE = 400;

/**
 * Rebuild `data/<projectId>-timeline.ttl` from parsed rows (prefixes + sorted events + standard comments).
 */
export function serializeTimelineTtlFromParsedEvents(events: ParsedTimelineEvent[]): string {
  const sorted = [...events].sort(compareParsedTimelineEventsAsc);
  let out = timelineFilePrefixes();
  for (const ev of sorted) {
    const p = parsedTimelineEventToPayload(ev);
    out += `\n# AuditEvent ${p.timestampIso} eventId=${p.eventId}\n`;
    out += timelineEventToTurtle(p);
  }
  return out;
}

export type RemoveTimelineEventsResult = {
  relPath: string;
  removedCount: number;
  remainingCount: number;
};

/**
 * Removes one or more audit events by `eventId` and rewrites the Turtle file.
 */
export function removeTimelineEventsFromDisk(
  projectId: string,
  eventIds: string[],
  cwd = process.cwd()
): RemoveTimelineEventsResult {
  if (!isSafeProjectId(projectId)) {
    throw new Error("Invalid projectId");
  }
  const ids = [...new Set(eventIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("No eventIds");
  }
  if (ids.length > MAX_BATCH_DELETE) {
    throw new Error(`Too many eventIds (max ${MAX_BATCH_DELETE})`);
  }
  for (const id of ids) {
    if (!isSafeTimelineEventId(id)) {
      throw new Error(`Invalid eventId: ${id}`);
    }
  }
  const idSet = new Set(ids);
  const absPath = timelineTtlPath(projectId, cwd);
  const relPath = `data/${projectId}-timeline.ttl`;
  if (!fs.existsSync(absPath)) {
    throw new Error("Timeline file not found");
  }
  const raw = fs.readFileSync(absPath, "utf-8");
  const parsed = parseTimelineTtl(raw);
  const before = parsed.length;
  const next = parsed.filter((e) => !idSet.has(e.eventId));
  const removedCount = before - next.length;
  if (removedCount === 0) {
    throw new Error("No matching events to remove");
  }
  fs.writeFileSync(absPath, serializeTimelineTtlFromParsedEvents(next), "utf-8");
  return { relPath, removedCount, remainingCount: next.length };
}
