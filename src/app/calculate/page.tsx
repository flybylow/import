"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import KgForceGraph, { type KGLink, type KGNode } from "@/components/KgForceGraph";

type KbStatusResponse = {
  projectId: string;
  kbPath: string;
  elementCount: number;
  epdCoverage: {
    materialsTotal: number;
    materialsWithEPD: number;
    materialsWithoutEPD: number;
  };
  kbGraph?: {
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
  matchingPreview?: {
    matched: Array<{
      materialId: number;
      materialName: string;
      epdSlug: string;
      epdName: string;
    }>;
    unmatched: Array<{
      materialId: number;
      materialName: string;
    }>;
  };
};

export default function CalculatePrepPage() {
  const [projectId, setProjectId] = useState<string>("example");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<KbStatusResponse | null>(null);

  const readyText = useMemo(() => {
    if (!status) return "";
    if (status.epdCoverage.materialsWithoutEPD === 0) {
      return "All materials have EPD. Carbon calculation can run without EPD gaps.";
    }
    return `There are still ${status.epdCoverage.materialsWithoutEPD} unmatched materials (no EPD). Carbon calculation will need data gaps for those.`;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setError(null);

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/kb/status?projectId=${encodeURIComponent(projectId)}`
        );
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Failed to load KB status");
        }
        const json: KbStatusResponse = await res.json();
        if (!cancelled) setStatus(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Phase 3 - Calculate (Prep)</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        This page is the “overview before calculation”: it shows what’s matched
        (materials with EPD) and what’s missing (materials without EPD) based on
        the latest KB graph (`data/&lt;projectId&gt;-kb.ttl`).
      </p>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-700 dark:text-zinc-200">
            projectId
          </label>
          <input
            className="border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1 text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </div>

        {loading ? <p className="mt-2 text-sm">Loading KB status...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      {status ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            Using KB: <code className="font-mono">{status.kbPath}</code>
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            Elements in enriched graph:{" "}
            <code className="font-mono">{status.elementCount}</code>
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            Materials with EPD:{" "}
            <code className="font-mono">
              {status.epdCoverage.materialsWithEPD}/{status.epdCoverage.materialsTotal}
            </code>
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            Materials without EPD:{" "}
            <code className="font-mono">
              {status.epdCoverage.materialsWithoutEPD}
            </code>
          </p>

          {status.kbGraph ? (
            <div className="mt-6 p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="text-sm font-medium">Link graph moved to Phase 2</div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                The link visualization + properties inspector now lives on the Phase 2
                page (`/kb`) so you can inspect and manually patch unmatched materials
                before running carbon calculation.
              </p>
              <a href="/kb" className="mt-2 inline-block text-xs underline">
                Open /kb
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GraphFromKBGraph(props: {
  kbGraph: NonNullable<KbStatusResponse["kbGraph"]>;
}) {
  const { kbGraph } = props;
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const lastHoveredNodeRef = useRef<any | null>(null);

  const graph = useMemo(() => {
    const nodes: KGNode[] = [];
    const links: KGLink[] = [];

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

    // Spread nodes to reduce overlap and improve picking.
    // Approximate desired arc-length between neighbors based on node diameter.
    const epdNodeDiameter = 26;
    const materialNodeDiameter = 20;

    const radiusSpreadFactor = 1.35;

    const epdRadius = Math.max(
      200,
      (kbGraph.epds.length * epdNodeDiameter) / (2 * Math.PI)
    ) * radiusSpreadFactor;
    const matchedRadius = Math.max(
      260,
      (matchedMaterials.length * materialNodeDiameter) / (2 * Math.PI)
    ) * radiusSpreadFactor;
    const unmatchedRadius = Math.max(
      280,
      (unmatchedMaterials.length * materialNodeDiameter) / (2 * Math.PI)
    ) * radiusSpreadFactor;

    // Build EPD nodes (unique per slug).
    const epdCount = kbGraph.epds.length;
    for (let i = 0; i < epdCount; i++) {
      const epd = kbGraph.epds[i];
      const angle = (2 * Math.PI * i) / Math.max(1, epdCount);
      nodes.push({
        id: `epd-${epd.epdSlug}`,
        label: epd.epdName,
        kind: "epd",
        x: epdRadius * Math.cos(angle),
        y: epdRadius * Math.sin(angle),
        val: 1.3,
        color: "#10b981",
        meta: { nodeType: "epd", epdSlug: epd.epdSlug, epdName: epd.epdName },
      });
    }

    // Build material nodes.
    const M = matchedMaterials.length;
    for (let i = 0; i < M; i++) {
      const m = matchedMaterials[i];
      const angle = (2 * Math.PI * i) / Math.max(1, M);
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

    const U = unmatchedMaterials.length;
    for (let i = 0; i < U; i++) {
      const u = unmatchedMaterials[i];
      const angle = (2 * Math.PI * i) / Math.max(1, U);
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
          epdSlug: undefined,
          matchType: undefined,
          matchConfidence: undefined,
        },
      });
    }

    // Links: material -> EPD (only for matched materials).
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
              console.debug("KG node click", {
                id: n?.id,
                kind: n?.kind,
                label: n?.label,
                meta: n?.meta,
                node: n,
              });
              // Force a new object reference so React re-renders the inspector.
              // Some node fields (notably `meta`) may not be enumerable, so preserve explicitly.
              setSelectedNode(
                n
                  ? {
                      id: n.id,
                      kind: n.kind,
                      label: n.label,
                      meta: n.meta,
                    }
                  : n
              );
            }}
            onNodeHover={(n) => {
              if (!n) return;
              lastHoveredNodeRef.current = n;
              console.debug("KG node hover", {
                id: n?.id,
                kind: n?.kind,
                label: n?.label,
              });
            }}
            onLinkClick={(l) => {
              console.debug("KG link click", {
                source: l?.source,
                target: l?.target,
              });
            }}
            onBackgroundClick={() => {
              console.debug("KG background click", {
                lastHovered: lastHoveredNodeRef.current?.id ?? null,
                lastHoveredKind: lastHoveredNodeRef.current?.kind ?? null,
              });
              // Do not clear selection on background clicks: react-force-graph may
              // emit background clicks together with node clicks, which makes the
              // inspector appear "unreliable".
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

            {/* Debug buttons removed: selection is updated via node/background clicks. */}
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
      onClick={() => {
        console.debug("Legend click", { label: props.label, color: props.color });
      }}
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

      {meta.nodeType !== "material" && meta.nodeType !== "epd" ? (
        <div className="text-zinc-600 dark:text-zinc-300">
          This is the KB hub anchor for the preview graph layout.
        </div>
      ) : null}
    </div>
  );
}

