"use client";

import { useMemo, useState } from "react";
import KgForceGraph, { type KGNode } from "@/components/KgForceGraph";

type KBGraph = {
  materials: Array<{
    materialId: number;
    materialName: string;
    hasEPD: boolean;
    epdSlug?: string;
    matchType?: string;
    matchConfidence?: number;
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

export default function KbGraphWithInspector(props: {
  kbGraph: KBGraph;
}) {
  const { kbGraph } = props;
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const graph = useMemo(() => {
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

    // Materials: keep rings tight to the center. EPDs: wider + optional extra rings so
    // shadow-canvas hit discs don't all overlap (only topmost node was clickable before).
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

    // Matched materials.
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

    // Unmatched materials.
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

    // EPD nodes last → drawn on top in canvas (shadow hit-test picks topmost when overlapping).
    nodes.push(...epdNodes);

    // Links: matched material -> its EPD node.
    for (const l of kbGraph.links) {
      links.push({
        source: `mat-${l.materialId}`,
        target: `epd-${l.epdSlug}`,
      });
    }

    return { nodes, links };
  }, [kbGraph]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <KgForceGraph
            nodes={graph.nodes}
            links={graph.links}
            onNodeClick={(n) => {
              if (!n) return;
              setSelectedNode(n ? { id: n.id, kind: n.kind, label: n.label, meta: n.meta } : n);
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
        : "KB hub";

  return (
    <div className="text-xs text-zinc-800 dark:text-zinc-50 space-y-2">
      <div className="font-medium">{title}</div>

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
                <span>{typeof meta.matchType === "string" ? meta.matchType : "—"}</span>
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

