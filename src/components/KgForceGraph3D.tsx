"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph3D: any = dynamic(
  () =>
    import("react-force-graph-3d").then(
      (m: any) => m.ForceGraph3D ?? m.default ?? m
    ),
  { ssr: false }
);

import type { KGNode, KGLink } from "@/components/KgForceGraph";

function useContainerSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 600, height: 480 });
  const lastSizeRef = useRef(size);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const next = {
        width: Math.max(280, Math.floor(rect.width)),
        height: Math.max(280, Math.floor(rect.height)),
      };

      const prev = lastSizeRef.current;
      const widthDelta = Math.abs(prev.width - next.width);
      const heightDelta = Math.abs(prev.height - next.height);
      if (widthDelta <= 2 && heightDelta <= 2) return;
      lastSizeRef.current = next;
      setSize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

/** Bright links + optional curvature so edges read clearly in 3D. */
const LINK_COLOR = "#fbbf24";
const LINK_PARTICLE_COLOR = "#fef08a";

export default function KgForceGraph3D(props: {
  nodes: KGNode[];
  links: KGLink[];
  focusNodeId?: string | null;
  onNodeClick?: (node: any) => void;
  onBackgroundClick?: () => void;
  /** Override outer box sizing (default: fixed min height for embedded cards). */
  graphOuterClassName?: string;
}) {
  const { nodes, links, graphOuterClassName } = props;
  const { ref, size } = useContainerSize();
  const fgMethodsRef = useRef<any>(null);
  const didInitialFitRef = useRef(false);

  const graph = useMemo(() => {
    return {
      nodes: nodes.map((n) => {
        const z =
          typeof n.z === "number" && Number.isFinite(n.z) ? n.z : 0;
        return {
          id: n.id,
          label: n.label,
          kind: n.kind,
          fx: n.x,
          fy: n.y,
          fz: z,
          val: n.val,
          color: n.color,
          meta: n.meta,
        };
      }),
      links,
    };
  }, [nodes, links]);

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
        fg.zoomToFit(500, 80, (n: { id?: string }) => n.id === id);
      });
    };
    const t = window.setTimeout(run, 100);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [props.focusNodeId, graph]);

  const outerClass =
    graphOuterClassName?.trim() ||
    "relative h-[min(520px,70vh)] min-h-[280px] min-w-0 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/40 dark:bg-zinc-950/60";

  return (
    <div ref={ref} className={outerClass}>
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
        <button
          type="button"
          className="rounded border border-zinc-200 bg-white/90 px-2 py-1 text-xs hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
          onClick={() => {
            fgMethodsRef.current?.zoomToFit(0, 40);
          }}
        >
          Fit
        </button>
        <p className="max-w-[10rem] text-right text-[10px] text-zinc-500 dark:text-zinc-400">
          Drag to rotate · scroll to zoom
        </p>
      </div>
      <ForceGraph3D
        ref={fgMethodsRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        graphData={graph as any}
        nodeLabel={(n: any) => n.label}
        nodeVal={(n: any) => n.val}
        nodeColor={(n: any) => n.color}
        nodeOpacity={0.95}
        nodeResolution={16}
        linkWidth={3}
        linkColor={() => LINK_COLOR}
        linkOpacity={1}
        linkDirectionalArrowLength={0}
        linkDirectionalParticles={4}
        linkDirectionalParticleSpeed={0.014}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleColor={() => LINK_PARTICLE_COLOR}
        linkCurvature={0.18}
        cooldownTicks={0}
        warmupTicks={0}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.35}
        enableNodeDrag={false}
        showNavInfo={false}
        onNodeClick={(node: any) => props.onNodeClick?.(node)}
        onBackgroundClick={() => props.onBackgroundClick?.()}
        onEngineStop={() => {
          if (didInitialFitRef.current) return;
          didInitialFitRef.current = true;
          if (props.focusNodeId?.trim()) return;
          fgMethodsRef.current?.zoomToFit(0, 40);
        }}
      />
    </div>
  );
}
