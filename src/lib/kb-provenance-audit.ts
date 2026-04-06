/**
 * Summarise a built KB Turtle store: provenance, EPD LCA readiness, element↔material links,
 * and how that lines up with UI surfaces (KB, BIM, Calculate). Used by `scripts/kb-provenance-audit.ts`.
 */
import * as $rdf from "rdflib";

import { calculationBlockedReason } from "@/lib/kb-read-epd";
import { extractMatchedSourceBreakdownFromStore } from "@/lib/kb-epd-stats";
import {
  buildFullKBGraph,
  extractMaterialExpressIdsFromTtl,
  parseKbTtlToStore,
} from "@/lib/kb-store-queries";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);

function getLit(store: $rdf.Store, subject: unknown, pred: unknown) {
  return store.any(subject as any, pred as any, null)?.value;
}

function safeNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export type KbProvenanceAudit = {
  /** What we inspected */
  projectId: string;
  /** Companion artefacts on disk (not loaded here; script fills paths) */
  companionFiles: {
    kbTtlPath: string;
    kbExists: boolean;
    kbBytes?: number;
    enrichedTtlPath: string;
    enrichedExists: boolean;
    calcLatestJsonPath: string;
    calcExists: boolean;
  };
  counts: {
    materialIdsInGraph: number;
    materialsWithEpd: number;
    materialsWithoutEpd: number;
    uniqueEpds: number;
    elementMaterialLinks: number;
    elementsWithMaterial: number;
  };
  /** Same buckets as `/api/kb/status` EPD coverage (material rows). */
  matchedMaterialsByDataset: Record<string, number>;
  /** `ont:matchType` on bim:material-* (dictionary_fuzzy+no-lca, source_ice, …). */
  materialsByMatchType: Record<string, number>;
  /** `ont:source` on bim:material-* (dictionary-no-lca, dictionary-routed, kbob-source, …). */
  materialsByMaterialSource: Record<string, number>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
    epdDataProvenance?: string;
    /** EPD-level dataset hint (e.g. ice, kbob) when copied from dictionary/source import */
    epdSource?: string;
    hasGwp: boolean;
    lcaReady: boolean;
    calculationBlockReason: string | null;
    linkedMaterialCount: number;
  }>;
  gaps: {
    /** Matched materials no IFC element links `ont:madeOf` in this KB */
    materialIdsWithEpdButNoElement: number[];
    /** Matched materials whose EPD node has no finite gwpPerUnit */
    materialIdsWithEpdMissingGwp: number[];
  };
  /** Human-readable lineage: IFC → enrich → KB vs TTL snapshots vs dictionary stubs */
  dataLineage: string[];
  /** Where the app surfaces this graph (for spotting mix-ups) */
  uiSurfaces: string[];
};

function histogramPush(h: Record<string, number>, key: string) {
  const k = key.trim() || "∅";
  h[k] = (h[k] ?? 0) + 1;
}

/**
 * Parse KB Turtle and return a structured audit. Does not read timeline TTL (separate pipeline).
 */
export function auditKbStore(projectId: string, store: $rdf.Store, kbTtl: string): KbProvenanceAudit {
  const materialIdsTotal = extractMaterialExpressIdsFromTtl(kbTtl);
  const graph = buildFullKBGraph(store, materialIdsTotal);

  const matchedByDataset = extractMatchedSourceBreakdownFromStore(store);

  const materialsByMatchType: Record<string, number> = {};
  const materialsByMaterialSource: Record<string, number> = {};
  for (const m of graph.materials) {
    if (m.matchType) histogramPush(materialsByMatchType, m.matchType);
    const mat = BIM(`material-${m.materialId}`);
    const src = getLit(store, mat, ONT("source")) ?? "∅";
    histogramPush(materialsByMaterialSource, src);
  }

  const elementCountByMaterial = new Map<number, number>();
  for (const l of graph.elementMaterialLinks ?? []) {
    elementCountByMaterial.set(l.materialId, (elementCountByMaterial.get(l.materialId) ?? 0) + 1);
  }

  const slugToMaterialCount = new Map<string, number>();
  for (const link of graph.links) {
    slugToMaterialCount.set(link.epdSlug, (slugToMaterialCount.get(link.epdSlug) ?? 0) + 1);
  }

  const epds: KbProvenanceAudit["epds"] = [];
  for (const e of graph.epds) {
    const ep = BIM(`epd-${e.epdSlug}`);
    const gwp = safeNum(getLit(store, ep, ONT("gwpPerUnit")));
    const prov = getLit(store, ep, ONT("epdDataProvenance"));
    const epdSource = getLit(store, ep, ONT("source"));
    const block = calculationBlockedReason({
      gwpPerUnit: gwp,
      epdDataProvenance: prov,
    });
    epds.push({
      epdSlug: e.epdSlug,
      epdName: e.epdName,
      epdDataProvenance: prov,
      epdSource,
      hasGwp: gwp != null,
      lcaReady: block === null,
      calculationBlockReason: block,
      linkedMaterialCount: slugToMaterialCount.get(e.epdSlug) ?? 0,
    });
  }

  const materialIdsWithEpdButNoElement: number[] = [];
  const materialIdsWithEpdMissingGwp: number[] = [];
  for (const m of graph.materials) {
    if (!m.hasEPD || !m.epdSlug) continue;
    const elCount = elementCountByMaterial.get(m.materialId) ?? 0;
    if (elCount === 0) materialIdsWithEpdButNoElement.push(m.materialId);
    const ep = BIM(`epd-${m.epdSlug}`);
    const gwp = safeNum(getLit(store, ep, ONT("gwpPerUnit")));
    if (gwp == null) materialIdsWithEpdMissingGwp.push(m.materialId);
  }

  const cwdNote =
    "IFC file + Phase 1 triples live under data/<projectId>.ifc and Phase 1 TTL; enriched TTL adds quantities/names; KB TTL is Phase 2 link graph (this file).";

  const dataLineage = [
    cwdNote,
    "Real LCA numbers appear only when Phase 2 copies GWP from imported source TTL (KBOB / ICE / B-EPD / …) onto bim:epd-* nodes, or from dictionary+kbobUuid hydration.",
    "dictionary-no-lca / dictionary-no-lca-data means routing from material-dictionary.json without a matching source row — EPD node is a stub until you import sources and rebuild KB.",
    "Timeline events (when present) are separate TTL/JSON from the Schependomlaan pipeline; they reference expressId / materialReference and do not auto-version the KB graph.",
  ];

  const uiSurfaces = [
    "/kb — kb/status matching preview (capped rows) + full KBGraph for material reader; same store as this audit.",
    "/bim — BuildingIfcViewer uses data/<projectId>.ifc (or test.ifc); Inspect panel loads passports via /api/kb/status element slice (not the whole KB graph in the browser).",
    "/calculate — uses kb/status selection + gwpPerUnit; skips materials where lcaReady is false (same rules as calculationBlockedReason).",
    "/timeline — graph + inspector use projectId; material links to BIM use expressId from events, not a second material-ID system.",
    "/sources — TTL imports and ordering; rebuilding KB reapplies dictionary + source overlap.",
  ];

  return {
    projectId,
    companionFiles: {
      kbTtlPath: "",
      kbExists: false,
      enrichedTtlPath: "",
      enrichedExists: false,
      calcLatestJsonPath: "",
      calcExists: false,
    },
    counts: {
      materialIdsInGraph: materialIdsTotal.size,
      materialsWithEpd: graph.materials.filter((m) => m.hasEPD).length,
      materialsWithoutEpd: graph.materials.filter((m) => !m.hasEPD).length,
      uniqueEpds: graph.epds.length,
      elementMaterialLinks: graph.elementMaterialLinks?.length ?? 0,
      elementsWithMaterial: graph.elements?.length ?? 0,
    },
    matchedMaterialsByDataset: matchedByDataset,
    materialsByMatchType,
    materialsByMaterialSource,
    epds,
    gaps: {
      materialIdsWithEpdButNoElement,
      materialIdsWithEpdMissingGwp,
    },
    dataLineage,
    uiSurfaces,
  };
}

export function auditKbTtlFile(
  projectId: string,
  kbTtlPath: string,
  kbTtl: string,
  companion: KbProvenanceAudit["companionFiles"]
): KbProvenanceAudit {
  const store = parseKbTtlToStore(kbTtl);
  const audit = auditKbStore(projectId, store, kbTtl);
  audit.companionFiles = companion;
  return audit;
}

/** Same text as the CLI (non-JSON) for admin / logs. */
export function formatKbProvenanceAuditText(audit: KbProvenanceAudit): string {
  const lines: string[] = [];
  const c = audit.companionFiles;
  lines.push(`KB provenance audit · projectId=${audit.projectId}`, "");
  lines.push("Files:");
  lines.push(
    `  KB TTL     ${c.kbExists ? "✓" : "✗"} ${c.kbTtlPath}${c.kbBytes != null ? ` (${c.kbBytes.toLocaleString()} B)` : ""}`
  );
  lines.push(`  Enriched   ${c.enrichedExists ? "✓" : "✗"} ${c.enrichedTtlPath}`);
  lines.push(`  Calc JSON  ${c.calcExists ? "✓" : "✗"} ${c.calcLatestJsonPath}`);
  lines.push("", "Counts:");
  lines.push(`  Material ids in graph     ${audit.counts.materialIdsInGraph}`);
  lines.push(`  With EPD                  ${audit.counts.materialsWithEpd}`);
  lines.push(`  Without EPD               ${audit.counts.materialsWithoutEpd}`);
  lines.push(`  Unique EPD nodes          ${audit.counts.uniqueEpds}`);
  lines.push(`  Element→material links    ${audit.counts.elementMaterialLinks}`);
  lines.push(`  Elements with ≥1 material ${audit.counts.elementsWithMaterial}`);

  lines.push("", "Matched materials by dataset (UI EPD coverage buckets):");
  for (const [k, v] of Object.entries(audit.matchedMaterialsByDataset).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`  ${k.padEnd(28)} ${v}`);
  }

  lines.push("", "Materials by ont:matchType:");
  for (const [k, v] of Object.entries(audit.materialsByMatchType).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${k.padEnd(40)} ${v}`);
  }

  lines.push("", "Materials by ont:source (material node):");
  for (const [k, v] of Object.entries(audit.materialsByMaterialSource).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`  ${k.padEnd(28)} ${v}`);
  }

  const stubEpds = audit.epds.filter((e) => !e.lcaReady);
  const readyEpds = audit.epds.filter((e) => e.lcaReady);
  lines.push(
    "",
    `EPDs: ${readyEpds.length} LCA-ready, ${stubEpds.length} blocked/incomplete`
  );
  for (const e of audit.epds.slice(0, 40)) {
    const flag = e.lcaReady ? "ready" : "BLOCK";
    lines.push(
      `  [${flag}] ${e.epdSlug} · materials=${e.linkedMaterialCount} · GWP=${e.hasGwp ? "yes" : "no"} · prov=${e.epdDataProvenance ?? "—"}${e.calculationBlockReason ? ` · ${e.calculationBlockReason}` : ""}`
    );
  }
  if (audit.epds.length > 40) {
    lines.push(`  … +${audit.epds.length - 40} more (use CLI --json for full EPD list)`);
  }

  const { materialIdsWithEpdButNoElement, materialIdsWithEpdMissingGwp } = audit.gaps;
  lines.push("", "Gaps:");
  lines.push(
    `  Matched materials with no element ont:madeOf link: ${materialIdsWithEpdButNoElement.length}` +
      (materialIdsWithEpdButNoElement.length
        ? ` (ids: ${materialIdsWithEpdButNoElement.slice(0, 20).join(", ")}${materialIdsWithEpdButNoElement.length > 20 ? " …" : ""})`
        : "")
  );
  lines.push(
    `  Matched materials whose EPD lacks gwpPerUnit:     ${materialIdsWithEpdMissingGwp.length}` +
      (materialIdsWithEpdMissingGwp.length
        ? ` (ids: ${materialIdsWithEpdMissingGwp.slice(0, 20).join(", ")}${materialIdsWithEpdMissingGwp.length > 20 ? " …" : ""})`
        : "")
  );

  lines.push("", "--- Data lineage (read this when UI feels mixed) ---");
  for (const line of audit.dataLineage) {
    lines.push(`  • ${line}`);
  }
  lines.push("", "--- UI surfaces (same KB, different slices) ---");
  for (const line of audit.uiSurfaces) {
    lines.push(`  • ${line}`);
  }

  return lines.join("\n");
}
