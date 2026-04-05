/**
 * Append MS Project XML tasks as timeline:AuditEvent (construction_schedule_task).
 *
 * Default input: docs/DataSetArch/Planning/XML/Uitvoering Schependomlaan 18-02-2015.xml
 * Optional sidecar: data/<projectId>-schedule-links.json (byTaskUid, byNameContains)
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/import-schependomlaan-msproject-timeline.ts
 *   npx tsx --tsconfig tsconfig.json scripts/import-schependomlaan-msproject-timeline.ts -- --input path.xml --projectId my-project
 */
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

import {
  timelineEventToTurtle,
  timelineFilePrefixes,
  type TimelineEventPayload,
} from "@/lib/timeline-events";

type MsTask = Record<string, unknown>;

type ScheduleLinksFile = {
  byTaskUid?: Record<string, { materialReference?: string; targetExpressId?: number }>;
  byNameContains?: Array<{
    contains: string;
    materialReference?: string;
    targetExpressId?: number;
  }>;
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function msProjectInstantToIso(raw: string): string {
  const t = raw.trim();
  if (!t) return new Date().toISOString();
  if (/[zZ]$/.test(t) || /[+-]\d{2}:?\d{2}$/.test(t)) {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
  }
  const ms = Date.parse(`${t}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function normalizeTasks(raw: unknown): MsTask[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MsTask[];
  return [raw as MsTask];
}

function loadScheduleLinks(cwd: string, projectId: string): ScheduleLinksFile {
  const p = path.join(cwd, "data", `${projectId}-schedule-links.json`);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ScheduleLinksFile;
  } catch {
    return {};
  }
}

function applyLinks(
  links: ScheduleLinksFile,
  uid: string,
  name: string
): { materialReference?: string; targetExpressId?: number } {
  const uidHit = links.byTaskUid?.[uid];
  if (uidHit) {
    const out: { materialReference?: string; targetExpressId?: number } = {};
    if (uidHit.materialReference?.trim()) out.materialReference = uidHit.materialReference.trim();
    if (uidHit.targetExpressId != null && Number.isFinite(Number(uidHit.targetExpressId))) {
      out.targetExpressId = Math.floor(Number(uidHit.targetExpressId));
    }
    if (out.materialReference || out.targetExpressId !== undefined) return out;
  }
  const lower = name.toLowerCase();
  for (const row of links.byNameContains ?? []) {
    const frag = row.contains.trim().toLowerCase();
    if (!frag || !lower.includes(frag)) continue;
    const out: { materialReference?: string; targetExpressId?: number } = {};
    if (row.materialReference?.trim()) out.materialReference = row.materialReference.trim();
    if (row.targetExpressId != null && Number.isFinite(Number(row.targetExpressId))) {
      out.targetExpressId = Math.floor(Number(row.targetExpressId));
    }
    return out;
  }
  return {};
}

function main() {
  const cwd = process.cwd();
  const projectId = argValue("--projectId") ?? "schependomlaan-2015";
  const inputPath =
    argValue("--input") ??
    path.join(
      cwd,
      "docs",
      "DataSetArch",
      "Planning",
      "XML",
      "Uitvoering Schependomlaan 18-02-2015.xml"
    );
  const skipSummary = !hasFlag("--include-summary-tasks");
  const dryRun = hasFlag("--dry-run");

  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input XML: ${inputPath}`);
    process.exit(1);
  }

  const ttlPath = path.join(cwd, "data", `${projectId}-timeline.ttl`);
  const existing = fs.existsSync(ttlPath) ? fs.readFileSync(ttlPath, "utf-8") : "";

  const xml = fs.readFileSync(inputPath, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const doc = parser.parse(xml) as { Project?: { Tasks?: { Task?: unknown } } };
  const taskNodes = doc.Project?.Tasks?.Task;
  const tasks = normalizeTasks(taskNodes);

  const links = loadScheduleLinks(cwd, projectId);

  const payloads: TimelineEventPayload[] = [];
  for (const t of tasks) {
    const uid = text(t.UID);
    const name = text(t.Name);
    if (!uid || !name) continue;
    if (skipSummary && (text(t.Summary) === "1" || text(t.Summary).toLowerCase() === "true"))
      continue;
    if (text(t.IsNull) === "1") continue;

    const startIso = msProjectInstantToIso(text(t.Start));
    const finishIso = msProjectInstantToIso(text(t.Finish));
    const pct = text(t.PercentComplete) || "0";
    const milestone = text(t.Milestone) === "1";
    const ts = milestone ? startIso : finishIso;
    const eventId = `evt-msp-${projectId}-${uid}`;
    if (existing.includes(`"${eventId}"`) || existing.includes(`"${eventId}" ;`)) {
      continue;
    }

    const outline = text(t.OutlineNumber);
    const wbs = text(t.WBS);
    const notes = text(t.Notes);
    const msgParts = [name];
    if (outline) msgParts.push(`Outline ${outline}`);
    if (wbs) msgParts.push(`WBS ${wbs}`);
    if (notes) msgParts.push(notes);
    const status =
      Number(pct) >= 100 ? "complete" : Number(pct) > 0 ? `in_progress_${pct}%` : "planned";

    const linked = applyLinks(links, uid, name);

    payloads.push({
      eventId,
      timestampIso: ts,
      actorSystem: true,
      actorLabel: "ms-project-xml",
      eventAction: "construction_schedule_task",
      message: msgParts.join("\n"),
      source: "ms-project-xml",
      confidence: 0.92,
      scheduleFields: {
        taskUid: uid,
        taskName: name,
        startIso,
        finishIso,
        percentComplete: pct,
        ...(outline ? { outlineNumber: outline } : {}),
        ...(wbs ? { wbs } : {}),
      },
      ...(linked.materialReference ? { materialReference: linked.materialReference } : {}),
      ...(linked.targetExpressId !== undefined ? { targetExpressId: linked.targetExpressId } : {}),
    });
  }

  payloads.sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));

  if (dryRun) {
    console.log(`Dry run: would append ${payloads.length} events to ${ttlPath}`);
    process.exit(0);
  }

  let block = "";
  if (!existing.trim()) {
    block = timelineFilePrefixes();
  }
  block += `\n# MS Project XML → construction_schedule_task (${path.basename(inputPath)})\n`;
  for (const p of payloads) {
    block += `\n# ${p.eventId} ${p.timestampIso}\n`;
    block += timelineEventToTurtle(p);
  }

  if (payloads.length === 0) {
    console.log(`No new tasks to append (all present or filtered). ${ttlPath}`);
    process.exit(0);
  }

  fs.appendFileSync(ttlPath, block, "utf-8");
  console.log(`Appended ${payloads.length} schedule events → ${ttlPath}`);
}

main();
