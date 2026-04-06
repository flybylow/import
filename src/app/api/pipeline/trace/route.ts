import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { loadSourcesConfig, resolveSourceTtlPath, sourceTtlExists } from "@/lib/sources-config";

export const runtime = "nodejs";

type FileSnap = {
  label: string;
  relativePath: string;
  exists: boolean;
  byteSize?: number;
  mtimeIso?: string;
};

function statDataFile(dataDir: string, fileName: string, label: string): FileSnap {
  const abs = path.join(dataDir, fileName);
  const relativePath = path.join("data", fileName).replace(/\\/g, "/");
  if (!fs.existsSync(abs)) {
    return { label, relativePath, exists: false };
  }
  const st = fs.statSync(abs);
  return {
    label,
    relativePath,
    exists: true,
    byteSize: st.size,
    mtimeIso: new Date(st.mtimeMs).toISOString(),
  };
}

/**
 * GET /api/pipeline/trace?projectId=example
 * Snapshot of pipeline artifacts, side inputs, and hints for debugging phase flow.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId` query param" }, { status: 400 });
  }

  const cwd = process.cwd();
  const dataDir = path.join(cwd, "data");

  const phases: Array<{
    id: string;
    title: string;
    description: string;
    files: FileSnap[];
  }> = [
    {
      id: "phase1-parse",
      title: "Phase 1 — Parse",
      description: "IFC → triples (BOT elements, ontology materials).",
      files: [
        statDataFile(dataDir, `${projectId}.ifc`, "IFC model"),
        statDataFile(dataDir, `${projectId}.ttl`, "Parsed graph"),
      ],
    },
    {
      id: "phase1-enrich",
      title: "Phase 1 — Enrich",
      description: "BaseQuantities and layer names for matching / calc.",
      files: [statDataFile(dataDir, `${projectId}-enriched.ttl`, "Enriched graph")],
    },
    {
      id: "phase2-translate",
      title: "Phase 2 — Translate (optional)",
      description: "Separate translate step; KB build often supersedes for linking.",
      files: [statDataFile(dataDir, `${projectId}-translated.ttl`, "Translated TTL")],
    },
    {
      id: "phase2-kb",
      title: "Phase 2 — Knowledge base",
      description: "Dictionary + sources → materials linked to EPD nodes (`*-kb.ttl`).",
      files: [statDataFile(dataDir, `${projectId}-kb.ttl`, "KB / linked graph")],
    },
    {
      id: "phase3-calc",
      title: "Phase 3 — Calculate",
      description: "Carbon trace outputs from Calculate.",
      files: [
        statDataFile(dataDir, `${projectId}-calc.ttl`, "Calc graph TTL"),
        statDataFile(dataDir, `${projectId}-calc-latest.json`, "Calc JSON (latest)"),
      ],
    },
  ];

  const dictRel = "src/data/material-dictionary.json";
  const dictAbs = path.join(cwd, dictRel);
  let dictionary: {
    path: string;
    exists: boolean;
    version?: string;
    byteSize?: number;
    mtimeIso?: string;
  } = { path: dictRel, exists: false };
  if (fs.existsSync(dictAbs)) {
    const st = fs.statSync(dictAbs);
    let version: string | undefined;
    try {
      const raw = JSON.parse(fs.readFileSync(dictAbs, "utf-8")) as { version?: string };
      version = typeof raw.version === "string" ? raw.version : undefined;
    } catch {
      version = undefined;
    }
    dictionary = {
      path: dictRel,
      exists: true,
      version,
      byteSize: st.size,
      mtimeIso: new Date(st.mtimeMs).toISOString(),
    };
  }

  const configRel = "config.json";
  const configAbs = path.join(cwd, configRel);
  const configJson = fs.existsSync(configAbs)
    ? {
        path: configRel,
        exists: true as const,
        byteSize: fs.statSync(configAbs).size,
        mtimeIso: new Date(fs.statSync(configAbs).mtimeMs).toISOString(),
      }
    : { path: configRel, exists: false as const };

  const cfg = loadSourcesConfig(cwd);
  const sources = (cfg.sources ?? []).map((s) => {
    const exists = sourceTtlExists(s, cwd);
    const ttlAbs = resolveSourceTtlPath(s, cwd);
    let byteSize: number | undefined;
    let mtimeIso: string | undefined;
    if (exists) {
      const st = fs.statSync(ttlAbs);
      byteSize = st.size;
      mtimeIso = new Date(st.mtimeMs).toISOString();
    }
    return {
      id: s.id,
      type: s.type,
      ttlPath: s.ttlPath,
      enabled: s.enabled !== false,
      exists,
      byteSize,
      mtimeIso,
    };
  });

  const enriched = statDataFile(dataDir, `${projectId}-enriched.ttl`, "");
  const kb = statDataFile(dataDir, `${projectId}-kb.ttl`, "");
  const parse = statDataFile(dataDir, `${projectId}.ttl`, "");

  const hints: string[] = [];
  if (!parse.exists) {
    hints.push("No parsed TTL — run Phase 1 parse (upload IFC / run fixture) so data/<projectId>.ttl exists.");
  }
  if (parse.exists && !enriched.exists) {
    hints.push("Parsed graph exists but no enriched TTL — run enrich on Phase 1.");
  }
  if (enriched.exists && !kb.exists) {
    hints.push("Enriched graph exists but no KB — open Phase 2 - Link and Build KB (or npm run build:kb).");
  }
  if (!dictionary.exists) {
    hints.push("material-dictionary.json missing — routing will fail.");
  }
  const disabledSources = sources.filter((s) => !s.enabled);
  if (disabledSources.length) {
    hints.push(
      `Sources disabled (no LCA hydration from these): ${disabledSources.map((s) => s.id).join(", ")}.`
    );
  }
  const missingSourceTtl = sources.filter((s) => s.enabled && !s.exists);
  if (missingSourceTtl.length) {
    hints.push(
      `Enabled source TTL missing on disk: ${missingSourceTtl.map((s) => `${s.id} → ${s.ttlPath}`).join("; ")}.`
    );
  }

  return NextResponse.json({
    projectId,
    generatedAt: new Date().toISOString(),
    phases,
    dictionary,
    configJson,
    sources,
    hints,
    summary: {
      hasParsedTtl: parse.exists,
      hasEnrichedTtl: enriched.exists,
      hasKbTtl: kb.exists,
      dictionaryVersion: dictionary.version ?? null,
    },
  });
}
