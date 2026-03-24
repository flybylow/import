import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { computeTripleDiff } from "@/lib/diff-triples";
import { extractMatchedSourceBreakdownFromStore } from "@/lib/kb-epd-stats";
import { getAvailableEpdsCatalog } from "@/lib/available-epds";
import {
  buildFullKBGraph,
  buildMatchingPreview,
  extractElementExpressIdsFromTtl,
  extractMaterialExpressIdsFromTtl,
  extractMaterialIdsWithHasEpdFromStore,
  parseKbTtlToStore,
  type KBGraph,
} from "@/lib/kb-store-queries";
import { translateLayer2FromEnrichedTtl } from "@/lib/layer2-translate";

export const runtime = "nodejs";

type KnowledgeBaseResponse = {
  projectId: string;
  kbPath: string;
  ttl: string;
  diff: unknown;
  elementCount: number;
  buildMeta: {
    kbBuiltAt: string;
    enrichedInput: {
      path: string;
      byteSize: number;
      mtimeIso: string;
    };
    materialDictionaryVersion: string | null;
    materialDictionaryMtimeIso: string;
  };
  epdCoverage: {
    materialsTotal: number;
    materialsWithEPD: number;
    materialsWithoutEPD: number;
    sourceBreakdown: Record<string, number>;
    matchedPreview: number[];
    unmatchedPreview: number[];
  };
  matchingPreview: ReturnType<typeof buildMatchingPreview>;
  epdCatalog: ReturnType<typeof getAvailableEpdsCatalog>;
  kbGraph: KBGraph;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = (body as { projectId?: string })?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const inputTtlPath = path.join(dataDir, `${projectId}-enriched.ttl`);
  const kbTtlPath = path.join(dataDir, `${projectId}-kb.ttl`);

  if (!fs.existsSync(inputTtlPath)) {
    return NextResponse.json(
      { error: `Input TTL not found: data/${projectId}-enriched.ttl` },
      { status: 404 }
    );
  }

  const enrichedTtl = fs.readFileSync(inputTtlPath, "utf-8");
  const enrichedStat = fs.statSync(inputTtlPath);

  const translateMeta = await translateLayer2FromEnrichedTtl({
    projectId,
    inputTtlPath,
    outputTtlPath: kbTtlPath,
  });

  const kbTtl = fs.readFileSync(kbTtlPath, "utf-8");

  const diff = computeTripleDiff({ oldTtl: enrichedTtl, newTtl: kbTtl, previewMax: 80 });

  const kbStore = parseKbTtlToStore(kbTtl);

  const elementIdsTotal = extractElementExpressIdsFromTtl(enrichedTtl);
  const materialIdsTotal = extractMaterialExpressIdsFromTtl(enrichedTtl);
  const epdMatchedMaterialIds = extractMaterialIdsWithHasEpdFromStore(kbStore);
  const epdMatchedSet = new Set(epdMatchedMaterialIds);
  const epdUnmatchedMaterialIds = Array.from(materialIdsTotal)
    .filter((id) => !epdMatchedSet.has(id))
    .sort((a, b) => a - b);

  const matchingPreview = buildMatchingPreview(kbStore, {
    matchedIds: epdMatchedMaterialIds,
    unmatchedIds: epdUnmatchedMaterialIds,
    limitMatched: 20,
    limitUnmatched: Math.max(epdUnmatchedMaterialIds.length, 1),
  });

  const epdCatalog = getAvailableEpdsCatalog();
  const sourceBreakdown = extractMatchedSourceBreakdownFromStore(kbStore);
  const kbGraph = buildFullKBGraph(kbStore, materialIdsTotal);

  const payload: KnowledgeBaseResponse = {
    projectId,
    kbPath: `data/${projectId}-kb.ttl`,
    ttl: kbTtl,
    diff,
    elementCount: elementIdsTotal.size,
    buildMeta: {
      kbBuiltAt: new Date().toISOString(),
      enrichedInput: {
        path: `data/${projectId}-enriched.ttl`,
        byteSize: enrichedStat.size,
        mtimeIso: new Date(enrichedStat.mtimeMs).toISOString(),
      },
      materialDictionaryVersion: translateMeta.materialDictionaryVersion ?? null,
      materialDictionaryMtimeIso: new Date(
        translateMeta.materialDictionaryMtimeMs
      ).toISOString(),
    },
    epdCoverage: {
      materialsTotal: materialIdsTotal.size,
      materialsWithEPD: epdMatchedMaterialIds.length,
      materialsWithoutEPD: epdUnmatchedMaterialIds.length,
      sourceBreakdown,
      matchedPreview: epdMatchedMaterialIds.slice(0, 60),
      unmatchedPreview: epdUnmatchedMaterialIds.slice(0, 60),
    },
    matchingPreview,
    epdCatalog,
    kbGraph,
  };

  return NextResponse.json(payload);
}
