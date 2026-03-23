import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { computeTripleDiff } from "@/lib/diff-triples";

export const runtime = "nodejs";

type EnrichRequest = {
  projectId?: string;
};

type DiffPreview = {
  addedCount: number;
  removedCount: number;
  addedPreview: string[];
  removedPreview: string[];
};

type MaterialMatch = {
  inBoth: number[];
  onlyInOld: number[];
  onlyInNew: number[];
};

function extractMaterialExpressIds(ttl: string): Set<number> {
  const ids = new Set<number>();
  const re = /bim:material-(\d+)/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(ttl))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

export async function POST(request: Request) {
  let body: EnrichRequest;
  try {
    body = (await request.json()) as EnrichRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const inputTtlPath = path.join(dataDir, `${projectId}.ttl`);
  const outTtlPath = path.join(dataDir, `${projectId}-enriched.ttl`);
  const ifcPath = path.join(dataDir, `${projectId}.ifc`);
  const fallbackIfcPath = path.join(dataDir, "IFC Schependomlaan.ifc");

  if (!fs.existsSync(inputTtlPath)) {
    return NextResponse.json(
      { error: `Input TTL not found: data/${projectId}.ttl` },
      { status: 404 }
    );
  }

  const resolvedIfcPath = fs.existsSync(ifcPath) ? ifcPath : fallbackIfcPath;
  if (!fs.existsSync(resolvedIfcPath)) {
    return NextResponse.json(
      {
        error:
          "Missing IFC file for enrichment. Expected either data/<projectId>.ifc or data/IFC Schependomlaan.ifc.",
      },
      { status: 404 }
    );
  }

  const { enrichLayer1FromIfc } = await import("@/lib/layer1-enrich");
  await enrichLayer1FromIfc({
    projectId,
    inputTtlPath,
    outputTtlPath: outTtlPath,
    ifcPath: resolvedIfcPath,
  });

  const oldTtl = fs.readFileSync(inputTtlPath, "utf-8");
  const newTtl = fs.readFileSync(outTtlPath, "utf-8");

  const ttl = newTtl;
  const diff = computeTripleDiff({ oldTtl, newTtl, previewMax: 60 });

  const oldMaterials = extractMaterialExpressIds(oldTtl);
  const newMaterials = extractMaterialExpressIds(newTtl);

  const inBoth: number[] = [];
  const onlyInOld: number[] = [];
  const onlyInNew: number[] = [];

  for (const id of oldMaterials) {
    if (newMaterials.has(id)) inBoth.push(id);
    else onlyInOld.push(id);
  }
  for (const id of newMaterials) {
    if (!oldMaterials.has(id)) onlyInNew.push(id);
  }

  inBoth.sort((a, b) => a - b);
  onlyInOld.sort((a, b) => a - b);
  onlyInNew.sort((a, b) => a - b);

  const materialMatch: MaterialMatch = {
    inBoth,
    onlyInOld,
    onlyInNew,
  };

  return NextResponse.json({
    projectId,
    ttlPath: path.join("data", `${projectId}-enriched.ttl`),
    ttl,
    diff,
    materialMatch,
  });
}

