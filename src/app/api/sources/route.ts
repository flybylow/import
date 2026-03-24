import fs from "fs";
import { execFileSync } from "child_process";
import { NextResponse } from "next/server";

import {
  loadSourcesConfig,
  resolveSourceTtlPath,
  saveSourcesConfig,
  sourceTtlExists,
} from "@/lib/sources-config";

export const runtime = "nodejs";

export async function GET() {
  const cwd = process.cwd();
  const cfg = loadSourcesConfig(cwd);

  const sources = (cfg.sources ?? []).map((s) => {
    const ttlAbs = resolveSourceTtlPath(s, cwd);
    const exists = sourceTtlExists(s, cwd);
    const reportPath = ttlAbs.replace(/\.ttl$/i, ".report.json");
    let report: unknown = null;
    try {
      if (fs.existsSync(reportPath)) {
        report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      }
    } catch {
      report = null;
    }

    return {
      id: s.id,
      type: s.type,
      ttlPath: s.ttlPath,
      enabled: s.enabled !== false,
      exists,
      report,
    };
  });

  return NextResponse.json({ sources });
}

function scriptsForSourceType(type: string): string | null {
  if (type === "kbob") return "scripts/import-kbob.js";
  if (type === "ice-educational") return "scripts/import-ice.js";
  return null;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body?.action as string | undefined;
  const sourceId = body?.sourceId as string | undefined;
  if (!action || !sourceId) {
    return NextResponse.json(
      { error: "Missing `action` or `sourceId`" },
      { status: 400 }
    );
  }

  const cwd = process.cwd();
  const cfg = loadSourcesConfig(cwd);
  const idx = cfg.sources.findIndex((s) => s.id === sourceId);
  if (idx < 0) {
    return NextResponse.json({ error: "Unknown sourceId" }, { status: 404 });
  }

  if (action === "set-active") {
    cfg.sources[idx].enabled = true;
    saveSourcesConfig(cfg, cwd);
    return NextResponse.json({ ok: true });
  }

  if (action === "set-inactive") {
    cfg.sources[idx].enabled = false;
    saveSourcesConfig(cfg, cwd);
    return NextResponse.json({ ok: true });
  }

  if (action === "move-up" || action === "move-down") {
    const target = action === "move-up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < cfg.sources.length) {
      const [entry] = cfg.sources.splice(idx, 1);
      cfg.sources.splice(target, 0, entry);
      saveSourcesConfig(cfg, cwd);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "import") {
    const script = scriptsForSourceType(cfg.sources[idx].type);
    if (!script) {
      return NextResponse.json(
        { error: `No importer for source type ${cfg.sources[idx].type}` },
        { status: 400 }
      );
    }
    try {
      // Run importers with Node directly (avoids npx/ts-node hangs or missing .ts files).
      execFileSync(process.execPath, [script], {
        cwd,
        stdio: "pipe",
        encoding: "utf-8",
      });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.stderr || e?.message || "Import failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
