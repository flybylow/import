/**
 * Read BCF 2.0 .bcfzip archives and print a trace report:
 * linked IFC filenames (markup header), viewpoint IfcGuids, comments (free text for material aliases).
 *
 * Optional: resolve GUID → expressId + passport material names via running app:
 *   npm run dev
 *   npx tsx --tsconfig tsconfig.json scripts/bcfzip-trace-sample.ts -- --origin http://127.0.0.1:3000 --projectId schependomlaan-2015
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/bcfzip-trace-sample.ts
 *   npx tsx --tsconfig tsconfig.json scripts/bcfzip-trace-sample.ts -- --file "docs/.../Controle Geelen V3+Dak 20-03-2015.bcfzip" --maxTopics 5
 */
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

import {
  allIfcGuidsFromViewpointXml,
  parseBcfMarkupXml,
} from "@/lib/bcfzip/extract-topics";
import { globalIdToExpressIdMap, lookupExpressIdForIfcGlobalIdTail } from "@/lib/timeline/construction-buildup";
import {
  ALL_INSTANCES_PASSPORT_LIMIT,
  loadPhase4Passports,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function numArg(flag: string, fallback: number): number {
  const v = argValue(flag);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const cwd = process.cwd();
  const projectId = argValue("--projectId") ?? "schependomlaan-2015";
  const origin = argValue("--origin")?.replace(/\/$/, "");
  const singleFile = argValue("--file");
  const maxZips = numArg("--maxZips", 2);
  const maxTopics = numArg("--maxTopics", 8);

  const defaultDir = path.join(
    cwd,
    "docs",
    "DataSetArch",
    "Coordination model and subcontractors models",
    "Checks",
    "BCF"
  );

  let zipPaths: string[] = [];
  if (singleFile) {
    const abs = path.isAbsolute(singleFile) ? singleFile : path.join(cwd, singleFile);
    if (!fs.existsSync(abs)) {
      console.error(`File not found: ${abs}`);
      process.exit(1);
    }
    zipPaths = [abs];
  } else if (fs.existsSync(defaultDir)) {
    zipPaths = fs
      .readdirSync(defaultDir)
      .filter((f) => f.toLowerCase().endsWith(".bcfzip"))
      .map((f) => path.join(defaultDir, f))
      .slice(0, maxZips);
  } else {
    console.error(`No --file and default dir missing: ${defaultDir}`);
    process.exit(1);
  }

  let globalMap: Map<string, number> | null = null;
  let byExpress: Record<number, Phase4ElementPassport> | null = null;
  if (origin) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const next = url.startsWith("http") ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
      return originalFetch(next, init);
    };
    try {
      const data = await loadPhase4Passports(projectId, undefined, {
        elementPassportsLimit: ALL_INSTANCES_PASSPORT_LIMIT,
        elementPassportsUniqueName: false,
      });
      globalMap = globalIdToExpressIdMap(data.ordered);
      byExpress = data.byExpressId;
      console.error(`Passport index: ${data.ordered.length} rows (projectId=${projectId})`);
    } catch (e) {
      console.error("KB fetch failed — print GUID-only trace.", e);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const report: unknown[] = [];

  for (const zipPath of zipPaths) {
    const archiveLabel = path.basename(zipPath);
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch (e) {
      console.error(`Skip ${archiveLabel}:`, e);
      continue;
    }
    const entries = zip.getEntries();
    let topicCount = 0;
    for (const ent of entries) {
      if (ent.isDirectory) continue;
      const name = ent.entryName.replace(/\\/g, "/");
      if (!name.endsWith("/markup.bcf") && !name.endsWith("markup.bcf")) continue;
      if (topicCount >= maxTopics) break;
      topicCount += 1;
      const folder = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
      const xml = ent.getData().toString("utf-8");
      const { linkedIfcFiles, topicTitles, comments } = parseBcfMarkupXml(xml);
      let viewpointXml = "";
      if (folder) {
        const vp = entries.find(
          (e: { entryName: string }) =>
            e.entryName.replace(/\\/g, "/") === `${folder}/viewpoint.bcfv`
        );
        if (vp) {
          try {
            viewpointXml = vp.getData().toString("utf-8");
          } catch {
            /* noop */
          }
        }
      }
      const ifcGuids = allIfcGuidsFromViewpointXml(viewpointXml);
      const resolutions =
        globalMap && ifcGuids.length > 0
          ? ifcGuids.map((g) => {
              const tail = g.replace(/^IFC_/i, "");
              const ex =
                lookupExpressIdForIfcGlobalIdTail(g, globalMap!) ??
                lookupExpressIdForIfcGlobalIdTail(tail, globalMap!);
              return { ifcGuid: g, expressId: ex ?? null };
            })
          : [];

      const materialHints: { ifcGuid: string; expressId: number; materials: string[]; ifcType?: string }[] =
        [];
      if (byExpress) {
        for (const r of resolutions) {
          if (r.expressId == null) continue;
          const p = byExpress[r.expressId];
          if (!p) continue;
          materialHints.push({
            ifcGuid: r.ifcGuid,
            expressId: r.expressId,
            materials: p.materials.map((m) => m.materialName).filter(Boolean),
            ...(p.ifcType ? { ifcType: p.ifcType } : {}),
          });
        }
      }

      report.push({
        archive: archiveLabel,
        folderGuid: folder || null,
        linkedIfcFiles,
        topicTitles: Object.fromEntries(topicTitles),
        ifcGuidsFromViewpoint: ifcGuids,
        guidToExpressPreview: resolutions,
        passportMaterialsWhenResolved: materialHints,
        comments: comments.map((c) => ({
          author: c.author,
          date: c.dateRaw,
          verbalStatus: c.verbalStatus,
          text: c.comment,
        })),
      });
    }
  }

  const outJson = hasFlag("--json");
  if (outJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const row of report) {
      console.log(JSON.stringify(row, null, 2));
      console.log("---");
    }
  }

  if (!origin) {
    console.error(
      "\nTip: start `npm run dev` and re-run with --origin http://127.0.0.1:3000 --projectId schependomlaan-2015 to resolve IfcGuid → expressId + material names."
    );
  }
}

void main();
