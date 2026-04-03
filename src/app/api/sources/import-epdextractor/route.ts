import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { loadSourcesConfig, resolveSourceTtlPath, saveSourcesConfig } from "@/lib/sources-config";

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

function redirectBackToSources(
  request: Request,
  params: Record<string, string | undefined>
) {
  const url = new URL("/sources", request.url);
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  let ttlAbsPath = String(form.get("ttlAbsPath") ?? "").trim();
  const sourceId = String(form.get("sourceId") ?? "b-epd-be").trim() || "b-epd-be";

  const cwd = process.cwd();
  const cfg = loadSourcesConfig(cwd);
  const idx = cfg.sources.findIndex((s) => s.id === sourceId);
  if (idx < 0) {
    return NextResponse.json({ error: `Unknown sourceId: ${sourceId}` }, { status: 404 });
  }

  const destDir = path.join(cwd, "data", "sources", "B-EPD");

  // Default behavior: if the form is empty, re-import from the currently configured TTL
  // for that source (absolute path resolved from config.json).
  if (!ttlAbsPath) {
    const configuredAbs = resolveSourceTtlPath(cfg.sources[idx], cwd);
    if (configuredAbs && configuredAbs.toLowerCase().endsWith(".ttl") && fs.existsSync(configuredAbs)) {
      ttlAbsPath = configuredAbs;
    }
  }

  if (!ttlAbsPath) {
    const configuredAbs = resolveSourceTtlPath(cfg.sources[idx], cwd);
    return redirectBackToSources(request, {
      importError: "Missing TTL path (and no configured TTL found for this source).",
      sourceId,
      ttlAbsPath: configuredAbs,
    });
  }
  if (!isSafeAbsPath(ttlAbsPath) || !ttlAbsPath.toLowerCase().endsWith(".ttl")) {
    return redirectBackToSources(request, {
      importError: "Invalid TTL path (must be an absolute .ttl path).",
      ttlAbsPath,
      sourceId,
    });
  }
  if (!fs.existsSync(ttlAbsPath)) {
    return redirectBackToSources(request, {
      importError: `TTL not found: ${ttlAbsPath}`,
      ttlAbsPath,
      sourceId,
    });
  }
  const stat = fs.statSync(ttlAbsPath);
  if (!stat.isFile()) {
    return redirectBackToSources(request, {
      importError: "TTL path is not a file.",
      ttlAbsPath,
      sourceId,
    });
  }
  if (stat.size > 50 * 1024 * 1024) {
    return redirectBackToSources(request, {
      importError: "TTL file too large (>50MB).",
      ttlAbsPath,
      sourceId,
    });
  }

  fs.mkdirSync(destDir, { recursive: true });

  // If the user already selected a TTL that lives inside our snapshots folder,
  // don't create another timestamped copy. Just activate it.
  const normalizedDestDir = path.resolve(destDir) + path.sep;
  const normalizedRequested = path.resolve(ttlAbsPath);
  const requestedIsInDestDir =
    normalizedRequested === path.resolve(destDir) ||
    normalizedRequested.startsWith(normalizedDestDir);

  const destTtl = requestedIsInDestDir
    ? normalizedRequested
    : uniqueDestPath(destDir, path.basename(ttlAbsPath));

  if (!requestedIsInDestDir) {
    fs.copyFileSync(ttlAbsPath, destTtl);
  }

  const reportSrc = ttlAbsPath.replace(/\.ttl$/i, ".report.json");
  if (fs.existsSync(reportSrc) && !requestedIsInDestDir) {
    fs.copyFileSync(reportSrc, destTtl.replace(/\.ttl$/i, ".report.json"));
  }

  cfg.sources[idx].ttlPath = path.relative(cwd, destTtl).replace(/\\/g, "/");
  cfg.sources[idx].enabled = true;
  saveSourcesConfig(cfg, cwd);

  return redirectBackToSources(request, {
    imported: "1",
    ttlAbsPath: destTtl,
    sourceId,
    importNote: requestedIsInDestDir
      ? "Using existing snapshot (no copy)."
      : "Copied TTL into data/sources/B-EPD/.",
  });
}

