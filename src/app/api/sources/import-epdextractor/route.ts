import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { loadSourcesConfig, saveSourcesConfig } from "@/lib/sources-config";

export const runtime = "nodejs";

function isSafeAbsPath(p: string): boolean {
  if (!p) return false;
  if (!path.isAbsolute(p)) return false;
  const normalized = path.normalize(p);
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
  const form = await request.formData();
  const ttlAbsPath = String(form.get("ttlAbsPath") ?? "").trim();
  const sourceId = String(form.get("sourceId") ?? "b-epd-be").trim() || "b-epd-be";

  if (!ttlAbsPath) {
    return NextResponse.json({ error: "Missing ttlAbsPath" }, { status: 400 });
  }
  if (!isSafeAbsPath(ttlAbsPath) || !ttlAbsPath.toLowerCase().endsWith(".ttl")) {
    return NextResponse.json({ error: "Invalid ttlAbsPath (must be absolute .ttl path)" }, { status: 400 });
  }
  if (!fs.existsSync(ttlAbsPath)) {
    return NextResponse.json({ error: `TTL not found: ${ttlAbsPath}` }, { status: 404 });
  }
  const stat = fs.statSync(ttlAbsPath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "TTL path is not a file" }, { status: 400 });
  }
  if (stat.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "TTL file too large (>50MB)" }, { status: 400 });
  }

  const cwd = process.cwd();
  const cfg = loadSourcesConfig(cwd);
  const idx = cfg.sources.findIndex((s) => s.id === sourceId);
  if (idx < 0) {
    return NextResponse.json({ error: `Unknown sourceId: ${sourceId}` }, { status: 404 });
  }

  const destDir = path.join(cwd, "data", "sources", "B-EPD");
  fs.mkdirSync(destDir, { recursive: true });
  const destTtl = uniqueDestPath(destDir, path.basename(ttlAbsPath));
  fs.copyFileSync(ttlAbsPath, destTtl);

  const reportSrc = ttlAbsPath.replace(/\.ttl$/i, ".report.json");
  if (fs.existsSync(reportSrc)) {
    fs.copyFileSync(reportSrc, destTtl.replace(/\.ttl$/i, ".report.json"));
  }

  cfg.sources[idx].ttlPath = path.relative(cwd, destTtl).replace(/\\/g, "/");
  cfg.sources[idx].enabled = true;
  saveSourcesConfig(cfg, cwd);

  return NextResponse.redirect(new URL("/sources?imported=1", request.url), 303);
}

