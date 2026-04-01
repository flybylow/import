import fs from "fs";
import path from "path";
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
  if (type === "b-epd-be") return "scripts/import-b-epd.js";
  return null;
}

function isSafeAbsPath(p: string): boolean {
  if (!p) return false;
  if (!path.isAbsolute(p)) return false;
  const normalized = path.normalize(p);
  // Very conservative: disallow null bytes and oddities.
  if (normalized.includes("\0")) return false;
  return true;
}

function uniqueDestPath(destDir: string, baseName: string): string {
  const safeBase = baseName.replace(/[^A-Za-z0-9._-]+/g, "_");
  const ext = path.extname(safeBase);
  const stem = safeBase.slice(0, safeBase.length - ext.length) || "b-epd";
  const candidate = path.join(destDir, safeBase);
  if (!fs.existsSync(candidate)) return candidate;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(destDir, `${stem}-${ts}${ext || ""}`);
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
  const ttlAbsPath = body?.ttlAbsPath as string | undefined;
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

  if (action === "import-epdextractor-ttl") {
    if (!ttlAbsPath || typeof ttlAbsPath !== "string") {
      return NextResponse.json({ error: "Missing `ttlAbsPath`" }, { status: 400 });
    }
    const requested = ttlAbsPath.trim();
    if (!isSafeAbsPath(requested) || !requested.toLowerCase().endsWith(".ttl")) {
      return NextResponse.json({ error: "Invalid `ttlAbsPath` (must be absolute .ttl path)" }, { status: 400 });
    }
    if (!fs.existsSync(requested)) {
      return NextResponse.json({ error: `TTL not found: ${requested}` }, { status: 404 });
    }

    const stat = fs.statSync(requested);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "TTL path is not a file" }, { status: 400 });
    }
    // Guardrail: avoid accidentally copying huge files.
    if (stat.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "TTL file too large (>50MB)" }, { status: 400 });
    }

    const dataDir = path.join(cwd, "data");
    const destDir = path.join(dataDir, "sources", "B-EPD");
    fs.mkdirSync(destDir, { recursive: true });

    const destTtl = uniqueDestPath(destDir, path.basename(requested));
    fs.copyFileSync(requested, destTtl);

    // Copy a sibling report file if present next to the TTL.
    const reportSrc = requested.replace(/\.ttl$/i, ".report.json");
    let copiedReport: string | null = null;
    if (fs.existsSync(reportSrc)) {
      const destReport = destTtl.replace(/\.ttl$/i, ".report.json");
      fs.copyFileSync(reportSrc, destReport);
      copiedReport = path.relative(cwd, destReport).replace(/\\/g, "/");
    }

    // Point the source entry at the copied TTL and enable it.
    cfg.sources[idx].ttlPath = path.relative(cwd, destTtl).replace(/\\/g, "/");
    cfg.sources[idx].enabled = true;
    saveSourcesConfig(cfg, cwd);

    return NextResponse.json({
      ok: true,
      imported: {
        ttlPath: path.relative(cwd, destTtl).replace(/\\/g, "/"),
        reportPath: copiedReport,
        bytes: stat.size,
      },
      note: "Imported TTL into data/sources/B-EPD/ and activated it in config.json. Rebuild KB on /kb.",
    });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
