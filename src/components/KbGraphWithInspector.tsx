"use client";

import { useEffect, useMemo, useState } from "react";
import KgForceGraph, { type KGNode } from "@/components/KgForceGraph";
import type { KBGraph } from "@/lib/kb-store-queries";

const MAX_ELEMENT_NODES = 500;

export default function KbGraphWithInspector(props: {
  kbGraph: KBGraph;
  /** Deep link from `/kb?expressId=` — switches zoom to that IFC element node when present. */
  focusExpressId?: number;
}) {
  const { kbGraph, focusExpressId } = props;
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const { nodes, links, elementStats } = useMemo(() => {
    const nodes: KGNode[] = [];
    const links: Array<{ source: string; target: string }> = [];

    const hubId = "kb-hub";
    nodes.push({
      id: hubId,
      label: "KB",
      kind: "hub",
      x: 0,
      y: 0,
      val: 3,
      color: "rgba(17,24,39,0.95)",
      meta: { nodeType: "hub" },
    });

    const matchedMaterials = kbGraph.materials.filter((m) => m.hasEPD);
    const unmatchedMaterials = kbGraph.materials.filter((m) => !m.hasEPD);

    const epdNameBySlug = new Map(
      kbGraph.epds.map((e) => [e.epdSlug, e.epdName])
    );

    const epdNodeDiameter = 26;
    const materialNodeDiameter = 20;
    const materialRingTight = 0.55;
    const epdRingSpread = 1.05;
    const maxEpdPerRing = 18;

    const matchedRadius =
      Math.max(
        52,
        (matchedMaterials.length * materialNodeDiameter) / (2 * Math.PI)
      ) * materialRingTight;
    const unmatchedRadius =
      Math.max(
        62,
        (unmatchedMaterials.length * materialNodeDiameter) / (2 * Math.PI)
      ) * materialRingTight;

    const epdList = kbGraph.epds;
    const epdRingCount = Math.max(1, Math.ceil(epdList.length / maxEpdPerRing));
    const epdR0 =
      Math.max(
        48,
        (Math.min(epdList.length, maxEpdPerRing) * epdNodeDiameter) /
          (2 * Math.PI)
      ) * epdRingSpread;

    const epdNodes: KGNode[] = [];
    for (let ring = 0; ring < epdRingCount; ring++) {
      const slice = epdList.slice(
        ring * maxEpdPerRing,
        (ring + 1) * maxEpdPerRing
      );
      const ringRadius = epdR0 * (1 + ring * 0.48);
      const n = slice.length;
      for (let i = 0; i < n; i++) {
        const epd = slice[i];
        const angle = (2 * Math.PI * i) / Math.max(1, n);
        epdNodes.push({
          id: `epd-${epd.epdSlug}`,
          label: epd.epdName,
          kind: "epd",
          x: ringRadius * Math.cos(angle),
          y: ringRadius * Math.sin(angle),
          val: 1.3,
          color: "#10b981",
          meta: { nodeType: "epd", epdSlug: epd.epdSlug, epdName: epd.epdName },
        });
      }
    }

    const maxEpdRingR =
      epdList.length === 0
        ? 0
        : epdR0 * (1 + Math.max(0, epdRingCount - 1) * 0.48);

    const allElements = kbGraph.elements ?? [];
    const allLinks = kbGraph.elementMaterialLinks ?? [];
    const materialIdsInGraph = new Set<number>([
      ...matchedMaterials.map((m) => m.materialId),
      ...unmatchedMaterials.map((m) => m.materialId),
    ]);

    let elementsShown = allElements.slice(0, MAX_ELEMENT_NODES);
    const truncated = allElements.length > elementsShown.length;
    const focusOk =
      focusExpressId != null && Number.isFinite(focusExpressId);
    if (
      focusOk &&
      !elementsShown.some((e) => e.expressId === focusExpressId)
    ) {
      const row = allElements.find((e) => e.expressId === focusExpressId);
      if (row) {
        elementsShown =
          elementsShown.length >= MAX_ELEMENT_NODES
            ? [...elementsShown.slice(0, -1), row].sort(
                (a, b) => a.expressId - b.expressId
              )
            : [...elementsShown, row].sort(
                (a, b) => a.expressId - b.expressId
              );
      }
    }

    const expressIdShown = new Set(elementsShown.map((e) => e.expressId));
    const elementNodeDiameter = 16;
    const elementRingTight = 0.78;
    const elementRadius =
      elementsShown.length === 0
        ? 0
        : Math.max(
            maxEpdRingR + 52,
            (elementsShown.length * elementNodeDiameter) / (2 * Math.PI)
          ) * elementRingTight;

    const elementNodes: KGNode[] = [];
    for (let i = 0; i < elementsShown.length; i++) {
      const el = elementsShown[i];
      const angle = (2 * Math.PI * i) / Math.max(1, elementsShown.length);
      const shortName = (el.elementName ?? "").trim();
      const label =
        shortName.length > 28
          ? `${shortName.slice(0, 26)}…`
          : shortName || `el ${el.expressId}`;
      elementNodes.push({
        id: `el-${el.expressId}`,
        label,
        kind: "element",
        x: elementRadius * Math.cos(angle),
        y: elementRadius * Math.sin(angle),
        val: 0.82,
        color:
          focusOk && el.expressId === focusExpressId ? "#c026d3" : "#d97706",
        meta: {
          nodeType: "element",
          expressId: el.expressId,
          elementName: el.elementName,
          ifcType: el.ifcType,
        },
      });
    }

    nodes.push(...elementNodes);

    for (let i = 0; i < matchedMaterials.length; i++) {
      const m = matchedMaterials[i];
      const angle =
        (2 * Math.PI * i) / Math.max(1, matchedMaterials.length);
      nodes.push({
        id: `mat-${m.materialId}`,
        label: m.materialName,
        kind: "materialMatched",
        x: matchedRadius * Math.cos(angle),
        y: matchedRadius * Math.sin(angle),
        val: 1.05,
        color: "#2563eb",
        meta: {
          nodeType: "material",
          materialId: m.materialId,
          materialName: m.materialName,
          hasEPD: true,
          epdSlug: m.epdSlug,
          epdName: m.epdSlug ? epdNameBySlug.get(m.epdSlug) : undefined,
          matchType: m.matchType,
          matchConfidence: m.matchConfidence,
        },
      });
    }

    for (let i = 0; i < unmatchedMaterials.length; i++) {
      const u = unmatchedMaterials[i];
      const angle =
        (2 * Math.PI * i) / Math.max(1, unmatchedMaterials.length);
      nodes.push({
        id: `mat-${u.materialId}`,
        label: u.materialName,
        kind: "materialUnmatched",
        x: unmatchedRadius * Math.cos(angle),
        y: unmatchedRadius * Math.sin(angle),
        val: 0.95,
        color: "#ef4444",
        meta: {
          nodeType: "material",
          materialId: u.materialId,
          materialName: u.materialName,
          hasEPD: false,
        },
      });
    }

    nodes.push(...epdNodes);

    for (const l of kbGraph.links) {
      links.push({
        source: `mat-${l.materialId}`,
        target: `epd-${l.epdSlug}`,
      });
    }

    for (const l of allLinks) {
      if (!expressIdShown.has(l.expressId)) continue;
      if (!materialIdsInGraph.has(l.materialId)) continue;
      links.push({
        source: `el-${l.expressId}`,
        target: `mat-${l.materialId}`,
      });
    }

    return {
      nodes,
      links,
      elementStats: {
        total: allElements.length,
        shown: elementsShown.length,
        truncated,
        linkCount: allLinks.length,
      },
    };
  }, [kbGraph, focusExpressId]);

  useEffect(() => {
    if (focusExpressId == null || !Number.isFinite(focusExpressId)) return;
    const nodeId = `el-${focusExpressId}`;
    const n = nodes.find((x) => x.id === nodeId);
    if (n) {
      setSelectedNode({
        id: n.id,
        kind: n.kind,
        label: n.label,
        meta: n.meta,
      });
    }
  }, [focusExpressId, nodes]);

  const focusNodeId =
    focusExpressId != null &&
    Number.isFinite(focusExpressId) &&
    nodes.some((n) => n.id === `el-${focusExpressId}`)
      ? `el-${focusExpressId}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {elementStats.total > 0 ? (
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          IFC elements in graph:{" "}
          <span className="font-mono">{elementStats.shown}</span>
          {elementStats.truncated ? (
            <>
              {" "}
              of <span className="font-mono">{elementStats.total}</span>{" "}
              (cap {MAX_ELEMENT_NODES} for performance)
            </>
          ) : null}
          {" · "}
          <span className="font-mono">{elementStats.linkCount}</span>{" "}
          element→material links in KB
        </div>
      ) : null}

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <KgForceGraph
            nodes={nodes}
            links={links}
            focusNodeId={focusNodeId}
            onNodeClick={(n) => {
              if (!n) return;
              setSelectedNode(
                n
                  ? { id: n.id, kind: n.kind, label: n.label, meta: n.meta }
                  : n
              );
            }}
            onBackgroundClick={() => {
              // Do not clear selection on background clicks. react-force-graph can
              // emit background clicks together with hover/click interactions.
            }}
          />
        </div>

        <div className="w-[280px] shrink-0">
          <div className="text-sm font-medium">Inspect properties</div>
          <div className="mt-2 p-3 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900">
            {selectedNode ? (
              <NodeInspector node={selectedNode} />
            ) : (
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Click a node in the graph to inspect its properties.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-700 dark:text-zinc-300">
        <div className="font-medium mb-1">Legend</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
          <LegendItem color="#d97706" label="IFC element" />
          <LegendItem color="#2563eb" label="Material (matched)" />
          <LegendItem color="#ef4444" label="Material (unmatched)" />
          <LegendItem color="#10b981" label="EPD" />
          <LegendItem color="rgba(17,24,39,0.95)" label="KB hub" />
        </div>
      </div>
    </div>
  );
}

function LegendItem(props: { color: string; label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 hover:opacity-90"
      onClick={() => {}}
    >
      <span
        aria-hidden
        style={{ backgroundColor: props.color }}
        className="inline-block w-3 h-3 rounded"
      />
      <span>{props.label}</span>
    </button>
  );
}

function NodeInspector(props: { node: any }) {
  const node = props.node;
  const meta = node?.meta ?? {};

  const title =
    meta.nodeType === "epd"
      ? "EPD"
      : meta.nodeType === "material"
        ? meta.hasEPD
          ? "Material (matched)"
          : "Material (unmatched)"
        : meta.nodeType === "element"
          ? "IFC element"
          : "KB hub";

  return (
    <div className="text-xs text-zinc-800 dark:text-zinc-50 space-y-2">
      <div className="font-medium">{title}</div>

      {meta.nodeType === "element" ? (
        <>
          <div>
            <span className="font-mono">expressId</span>:{" "}
            <span>{meta.expressId ?? "—"}</span>
          </div>
          <div>
            <span className="font-mono">ifcType</span>:{" "}
            <span>{meta.ifcType ?? "—"}</span>
          </div>
          <div>
            <span className="font-mono">name</span>:{" "}
            <span>{meta.elementName ?? "—"}</span>
          </div>
        </>
      ) : null}

      {meta.nodeType === "material" ? (
        <>
          <div>
            <span className="font-mono">materialId</span>:{" "}
            <span>{meta.materialId ?? "—"}</span>
          </div>
          <div>
            <span className="font-mono">name</span>:{" "}
            <span>{meta.materialName ?? "—"}</span>
          </div>
          {meta.hasEPD ? (
            <>
              <div>
                <span className="font-mono">epdSlug</span>:{" "}
                <span>{meta.epdSlug ?? "—"}</span>
              </div>
              <div>
                <span className="font-mono">epdName</span>:{" "}
                <span>{meta.epdName ?? "—"}</span>
              </div>
              <div>
                <span className="font-mono">matchType</span>:{" "}
                <span>
                  {typeof meta.matchType === "string" ? meta.matchType : "—"}
                </span>
              </div>
              <div>
                <span className="font-mono">matchConfidence</span>:{" "}
                <span>
                  {typeof meta.matchConfidence === "number"
                    ? meta.matchConfidence.toFixed(2)
                    : "—"}
                </span>
              </div>
            </>
          ) : (
            <div className="text-zinc-500 dark:text-zinc-400">
              No attached EPD yet (unmatched).
            </div>
          )}
        </>
      ) : null}

      {meta.nodeType === "epd" ? (
        <>
          <div>
            <span className="font-mono">epdSlug</span>:{" "}
            <span>{meta.epdSlug ?? "—"}</span>
          </div>
          <div>
            <span className="font-mono">name</span>:{" "}
            <span>{meta.epdName ?? node.label ?? "—"}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
