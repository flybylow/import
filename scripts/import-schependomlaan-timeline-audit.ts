/**
 * Writes data/schependomlaan-2015-timeline.ttl for GET /api/timeline (timeline:AuditEvent).
 * Source: data/schependomlaan-timeline.json (from seed-timeline-schependomlaan.ts).
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/import-schependomlaan-timeline-audit.ts
 */
import fs from "fs";
import path from "path";

import {
  timelineEventToTurtle,
  timelineFilePrefixes,
  type TimelineEventPayload,
} from "@/lib/timeline-events";
import type { TimelineEventAction } from "@/lib/timeline-events-vocab";

type SchependomlaanJsonRow = {
  eventId: string;
  projectId: string;
  timestamp: string;
  actor: string;
  actionType: string;
  description: string;
  bimReference: string;
  materialReference: string;
  comment: string;
  source: string;
  confidence: number;
};

/** Map BIM seed action to a vocabulary literal the timeline UI understands. */
function mapAction(_raw: string): TimelineEventAction {
  return "site_report_added";
}

function buildMessage(row: SchependomlaanJsonRow): string {
  const parts: string[] = [row.description.trim()];
  const c = row.comment.trim();
  if (c && c !== row.description.trim()) parts.push(c);
  const b = row.bimReference.trim();
  if (b) parts.push(`BIM: ${b}`);
  return parts.join("\n");
}

function rowToPayload(row: SchependomlaanJsonRow): TimelineEventPayload {
  return {
    eventId: row.eventId,
    timestampIso: row.timestamp,
    actorSystem: false,
    actorLabel: row.actor,
    eventAction: mapAction(row.actionType),
    message: buildMessage(row),
    source: row.source,
    confidence: row.confidence,
    materialReference: row.materialReference,
  };
}

function main() {
  const cwd = process.cwd();
  const inputPath = path.join(cwd, "data", "schependomlaan-timeline.json");
  const outputPath = path.join(cwd, "data", "schependomlaan-2015-timeline.ttl");

  if (!fs.existsSync(inputPath)) {
    console.error(`Missing ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as SchependomlaanJsonRow[];
  if (!Array.isArray(raw) || raw.length === 0) {
    console.error("Expected non-empty JSON array");
    process.exit(1);
  }

  const sorted = [...raw].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let out =
    timelineFilePrefixes() +
    "\n# Imported from data/schependomlaan-timeline.json → timeline:AuditEvent (construction schedule).\n";

  for (const row of sorted) {
    if (row.projectId !== "schependomlaan-2015") {
      console.warn(`Skipping event ${row.eventId}: projectId ${row.projectId}`);
      continue;
    }
    out += `\n# ${row.eventId} ${row.timestamp}\n`;
    out += timelineEventToTurtle(rowToPayload(row));
  }

  fs.writeFileSync(outputPath, out, "utf-8");
  console.log(`Wrote ${outputPath} (${sorted.length} events)`);
}

main();
