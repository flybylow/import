"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// react-force-graph-2d depends on canvas APIs; keep it client-only.
// The package typings are incomplete for our usage (ref/methods), so cast to `any`.
const ForceGraph2D: any = dynamic(
  () =>
    import("react-force-graph-2d").then(
      (m: any) => m.ForceGraph2D ?? m.default ?? m
    ),
  { ssr: false }
);

type KGNodeKind =
  | "hub"
  | "element"
  | "materialMatched"
  | "materialUnmatched"
  | "epd"
  | "timelineHub"
  | "timelineEvent"
  | "timelineProp";

export type KGNode = {
  id: string;
  label: string;
  kind: KGNodeKind;
  x: number;
  y: number;
  /** Optional depth for 3D graphs (`KgForceGraph3D` maps this to `fz`). */
  z?: number;
  // Optional fixed position. Leave undefined to allow node dragging.
  fx?: number;
  fy?: number;
  val: number;
  color: string;
  meta?: Record<string, any>;
};

export type KGLink = {
  source: string;
  target: string;
};

function useContainerSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 600, height: 420 });
  const lastSizeRef = useRef(size);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const next = {
        width: Math.max(280, Math.floor(rect.width)),
        height: Math.max(240, Math.floor(rect.height)),
      };

      // Avoid ResizeObserver feedback loops by updating only on meaningful changes.
      const prev = lastSizeRef.current;
      const widthDelta = Math.abs(prev.width - next.width);
      const heightDelta = Math.abs(prev.height - next.height);
      const meaningfulChange = widthDelta > 2 || heightDelta > 2;

      if (!meaningfulChange) return;
      lastSizeRef.current = next;
      setSize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export default function KgForceGraph(props: {
  nodes: KGNode[];
  links: KGLink[];
  /** When set, zoom the viewport to this node id after layout (e.g. `el-33028`). */
  focusNodeId?: string | null;
  onNodeClick?: (node: any) => void;
  onLinkClick?: (link: any) => void;
  onNodeHover?: (node: any | null) => void;
  onBackgroundClick?: () => void;
}) {
  const { nodes, links } = props;
  const { ref, size } = useContainerSize();
  const fgMethodsRef = useRef<any>(null);
  const didInitialFitRef = useRef(false);

  const graph = useMemo(() => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.label,
        kind: n.kind,
        x: n.x,
        y: n.y,
        ...(typeof n.fx === "number" ? { fx: n.fx } : {}),
        ...(typeof n.fy === "number" ? { fy: n.fy } : {}),
        val: n.val,
        color: n.color,
        meta: n.meta,
      })),
      links,
    };
  }, [nodes, links]);

  // Reset one-time fit when the graph dataset changes.
  useEffect(() => {
    didInitialFitRef.current = false;
  }, [nodes, links]);

  useEffect(() => {
    const id = props.focusNodeId?.trim();
    if (!id) return;
    let raf = 0;
    const run = () => {
      raf = requestAnimationFrame(() => {
        const fg = fgMethodsRef.current;
        if (!fg?.zoomToFit) return;
        fg.zoomToFit(500, 72, (n: { id?: string }) => n.id === id);
      });
    };
    const t = window.setTimeout(run, 80);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [props.focusNodeId, graph]);

  return (
    <div
      ref={ref}
      className="relative h-[420px] min-w-0 w-full overflow-hidden rounded border border-zinc-200 dark:border-zinc-800 bg-transparent"
    >
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-white/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 backdrop-blur"
          onClick={() => {
            fgMethodsRef.current?.zoomToFit(0, 20);
          }}
        >
          Fit
        </button>
      </div>
      <ForceGraph2D
        ref={fgMethodsRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        graphData={graph as any}
        nodeLabel={(n: any) => n.label}
        // Keep default-ish sizing. Clickability should come from correct
        // hit-test math, not from constantly inflating sizes.
        nodeRelSize={4}
        linkDirectionalParticles={0}
        autoPauseRedraw={true}
        // Freeze the layout early so hover and click hit-testing stay consistent.
        warmupTicks={0}
        cooldownTicks={0}
        dagMode={false}
        enablePointerInteraction={true}
        // Fixed radial layout — dragging steals clicks and stacks nodes unpredictably.
        enableNodeDrag={false}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.2}
        maxZoom={6}
        showNavInfo={false}
        onNodeClick={(node: any) => props.onNodeClick?.(node)}
        onLinkClick={(link: any) => props.onLinkClick?.(link)}
        onNodeHover={(node: any) => props.onNodeHover?.(node)}
        onBackgroundClick={() => props.onBackgroundClick?.()}
        // Default pointer areas can end up too small for dense graphs,
        // so we enlarge the hit-test area while keeping default visuals.
        nodePointerAreaPaint={(
          node: any,
          paintColor: string,
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          // Shadow canvas uses index colors; when hit circles overlap, the last-drawn node wins.
          // Keep hit discs modest so dense EPD rings don't "steal" each other's pixels.
          let val =
            typeof node.val === "number" ? node.val : Number(node.val);
          if (!Number.isFinite(val) || val <= 0) val = 1;
          const nodeRelSize = 4; // must match the `nodeRelSize` prop we pass to ForceGraph2D
          const safeGlobalScale =
            typeof globalScale === "number" && globalScale > 0 ? globalScale : 1;
          const padAmount = 0.55 / safeGlobalScale;

          const rBase = Math.sqrt(Math.max(0, val || 1)) * nodeRelSize + padAmount;
          // Minimum ~8px on screen for usability; cap so overlapping EPDs stay pickable.
          const minWorld = 8 / safeGlobalScale;
          const maxWorld = 22 / safeGlobalScale;
          const hitRadius = Math.min(maxWorld, Math.max(rBase, minWorld));

          ctx.beginPath();
          ctx.fillStyle = paintColor;
          ctx.arc(node.x, node.y, hitRadius, 0, Math.PI * 2);
          ctx.fill();
        }}
        onEngineStop={() => {
          if (didInitialFitRef.current) return;
          didInitialFitRef.current = true;
          if (props.focusNodeId?.trim()) return;
          fgMethodsRef.current?.zoomToFit(0, 20);
        }}
      />
    </div>
  );
}

