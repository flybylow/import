/**
 * Append BCF 2.0 (.bcfzip) coordination issues as timeline:AuditEvent (bcf_coordination_event).
 *
 * Scans docs/DataSetArch/.../Checks/BCF/*.bcfzip by default.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/import-schependomlaan-bcf-timeline.ts
 *   npx tsx --tsconfig tsconfig.json scripts/import-schependomlaan-bcf-timeline.ts -- --dir /path/to/bcf --projectId schependomlaan-2015
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";

import {
  allIfcGuidsFromViewpointXml,
  parseBcfMarkupXml,
} from "@/lib/bcfzip/extract-topics";
import {
  timelineEventToTurtle,
  timelineFilePrefixes,
  type TimelineEventPayload,
} from "@/lib/timeline-events";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function main() {
  const cwd = process.cwd();
  const projectId = argValue("--projectId") ?? "schependomlaan-2015";
  const dir =
    argValue("--dir") ??
    path.join(
      cwd,
      "docs",
      "DataSetArch",
      "Coordination model and subcontractors models",
      "Checks",
      "BCF"
    );
  const dryRun = hasFlag("--dry-run");

  if (!fs.existsSync(dir)) {
    console.error(`BCF directory not found: ${dir}`);
    process.exit(1);
  }

  const ttlPath = path.join(cwd, "data", `${projectId}-timeline.ttl`);
  let existing = fs.existsSync(ttlPath) ? fs.readFileSync(ttlPath, "utf-8") : "";

  const zips = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".bcfzip"))
    .map((f) => path.join(dir, f));

  const payloads: TimelineEventPayload[] = [];

  for (const zipPath of zips) {
    const archiveLabel = path.basename(zipPath);
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      console.warn(`Skip unreadable zip: ${archiveLabel}`);
      continue;
    }
    const entries = zip.getEntries();
    for (const ent of entries) {
      if (ent.isDirectory) continue;
      const name = ent.entryName.replace(/\\/g, "/");
      if (!name.endsWith("/markup.bcf") && !name.endsWith("markup.bcf")) continue;
      const folder = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
      let xml: string;
      try {
        xml = ent.getData().toString("utf-8");
      } catch {
        continue;
      }
      const { topicTitles, comments } = parseBcfMarkupXml(xml);
      let ifcGuids: string[] = [];
      if (folder) {
        const vp = entries.find(
          (e: { entryName: string }) =>
            e.entryName.replace(/\\/g, "/") === `${folder}/viewpoint.bcfv`
        );
        if (vp) {
          try {
            ifcGuids = allIfcGuidsFromViewpointXml(vp.getData().toString("utf-8"));
          } catch {
            /* ignore */
          }
        }
      }

      let commentIndex = 0;
      for (const c of comments) {
        commentIndex += 1;
        const commentGuid = c.commentGuid || `no-guid-${commentIndex}`;
        const topicGuid = c.topicGuid || commentGuid;
        const title = topicTitles.get(topicGuid) ?? "BCF issue";
        const dateRaw = c.dateRaw;
        const ms = dateRaw ? Date.parse(dateRaw) : NaN;
        const timestampIso = Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
        const author = c.author || "unknown";
        const body = c.comment;
        const verbal = c.verbalStatus;
        const idKey = `${archiveLabel}|${commentGuid}|${timestampIso}|${author}`;
        const idHash = createHash("sha256").update(idKey).digest("hex").slice(0, 14);
        const eventId = `evt-bcf-${projectId}-${idHash}`;
        if (existing.includes(`"${eventId}"`)) continue;

        const msgParts = [title];
        if (body) msgParts.push(body);
        if (verbal) msgParts.push(`Status: ${verbal}`);
        msgParts.push(`Archive: ${archiveLabel}`);

        const bcfFields: NonNullable<TimelineEventPayload["bcfFields"]> = {
          topicGuid,
          sourceArchive: archiveLabel,
          ...(verbal ? { verbalStatus: verbal } : {}),
        };
        if (ifcGuids.length > 0) {
          bcfFields.ifcGuid = ifcGuids[0];
          if (ifcGuids.length > 1) {
            bcfFields.bcfIfcGuidsJson = JSON.stringify(ifcGuids);
          }
        }

        payloads.push({
          eventId,
          timestampIso,
          actorSystem: false,
          actorLabel: author,
          eventAction: "bcf_coordination_event",
          message: msgParts.join("\n"),
          source: "bcfzip-import",
          confidence: 0.88,
          bcfFields,
        });
      }
    }
  }

  payloads.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));

  if (dryRun) {
    console.log(`Dry run: would append ${payloads.length} BCF events to ${ttlPath}`);
    process.exit(0);
  }

  if (payloads.length === 0) {
    console.log(`No new BCF events to append. ${ttlPath}`);
    process.exit(0);
  }

  let block = "";
  if (!existing.trim()) {
    block = timelineFilePrefixes();
    existing = block;
  }
  block += `\n# BCF 2.0 bcfzip → bcf_coordination_event (${zips.length} archives)\n`;
  for (const p of payloads) {
    block += `\n# ${p.eventId} ${p.timestampIso}\n`;
    block += timelineEventToTurtle(p);
  }

  fs.appendFileSync(ttlPath, block, "utf-8");
  console.log(`Appended ${payloads.length} BCF events → ${ttlPath}`);
}

main();
