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

/**
 * Sphere radius scales as `nodeRelSize * cbrt(nodeVal)` (three-forcegraph).
 * Library default is 4; timeline graphs use slightly larger nodes for readability / perf experiments.
 */
const NODE_REL_SIZE = 5;

type ForceGraphRef = {
  camera: () => { fov: number; aspect: number; position: { x: number; y: number; z: number } };
  controls: () => { target: { x: number; y: number; z: number } };
  cameraPosition: (
    pos: { x: number; y: number; z: number },
    lookAt: { x: number; y: number; z: number },
    transitionMs?: number
  ) => unknown;
};

function sphereRadiusFromVal(val: number): number {
  return NODE_REL_SIZE * Math.cbrt(Math.max(val, 0.01));
}

/**
 * Axis-aligned bounds of node spheres (matches three-forcegraph radius = relSize * cbrt(val)).
 */
function layoutBoundsFromNodes(nodes: KGNode[]): {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
} | null {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    const z = typeof n.z === "number" && Number.isFinite(n.z) ? n.z : 0;
    const r = sphereRadiusFromVal(n.val);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const halfDiag = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { cx, cy, cz, radius: Math.max(halfDiag, 8) };
}

/**
 * `zoomToFit` in three-render-objects assumes the graph is centered on the world origin; timeline
 * layouts are offset (e.g. hub at negative X), which makes the library place the camera too far and
 * the graph looks tiny. Fit using real layout center + bounding sphere.
 */
function fitCameraToNodeLayout(
  fg: ForceGraphRef | null | undefined,
  nodes: KGNode[],
  viewW: number,
  viewH: number,
  paddingPx: number,
  transitionMs: number
): void {
  if (!fg?.camera || !fg.controls || !fg.cameraPosition) return;
  const b = layoutBoundsFromNodes(nodes);
  if (!b) return;

  const camera = fg.camera();
  const controls = fg.controls();
  const fovRad = (camera.fov * Math.PI) / 180;
  const aspect = camera.aspect > 0 ? camera.aspect : viewW / Math.max(viewH, 1);
  const h = Math.max(viewH, 1);
  const w = Math.max(viewW, 1);
  const vertPad = 1 + (paddingPx * 2) / h;
  const horizPad = 1 + (paddingPx * 2) / w;
  const distV = (b.radius * vertPad) / Math.tan(fovRad / 2);
  const distH = (b.radius * horizPad) / (Math.tan(fovRad / 2) * aspect);
  const dist = Math.max(distV, distH, 80);

  const target = controls.target;
  let dx = camera.position.x - target.x;
  let dy = camera.position.y - target.y;
  let dz = camera.position.z - target.z;
  let len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) {
    dx = 0.35;
    dy = 0.22;
    dz = 1;
    len = Math.hypot(dx, dy, dz);
  }
  dx /= len;
  dy /= len;
  dz /= len;

  fg.cameraPosition(
    { x: b.cx + dx * dist, y: b.cy + dy * dist, z: b.cz + dz * dist },
    { x: b.cx, y: b.cy, z: b.cz },
    transitionMs
  );
}

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

function snapGraphNodeToLayoutLock(node: {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  __layoutLock?: { x: number; y: number; z: number };
  __threeObj?: { position: { set: (x: number, y: number, z: number) => void } };
}) {
  const L = node.__layoutLock;
  if (!L) return;
  node.x = node.fx = L.x;
  node.y = node.fy = L.y;
  node.z = node.fz = L.z;
  const obj = node.__threeObj;
  if (obj) obj.position.set(L.x, L.y, L.z);
}

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

  const hasDraggableNodes = useMemo(
    () => nodes.some((n) => n.draggable === true),
    [nodes]
  );

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
          /** Internal: only message/note satellites are draggable; others snap back each tick. */
          kgDraggable: n.draggable === true,
          __layoutLock: { x: n.x, y: n.y, z },
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
        const fg = fgMethodsRef.current as ForceGraphRef | null;
        const subset = props.nodes.filter((n) => n.id === id);
        if (subset.length === 0) return;
        fitCameraToNodeLayout(fg, subset, size.width, size.height, 72, 500);
      });
    };
    const t = window.setTimeout(run, 100);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [props.focusNodeId, props.nodes, size.width, size.height]);

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
            fitCameraToNodeLayout(
              fgMethodsRef.current as ForceGraphRef | null,
              props.nodes,
              size.width,
              size.height,
              56,
              0
            );
          }}
        >
          Fit
        </button>
        <p className="max-w-[11rem] text-right text-[10px] text-zinc-500 dark:text-zinc-400">
          {hasDraggableNodes
            ? "Drag note bubbles to move · drag background to orbit · scroll zoom"
            : "Drag to rotate · scroll to zoom"}
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
        nodeRelSize={NODE_REL_SIZE}
        nodeResolution={16}
        linkWidth={3.5}
        linkColor={(l: { color?: string }) => (typeof l.color === "string" ? l.color : LINK_COLOR)}
        linkOpacity={1}
        linkDirectionalArrowLength={0}
        linkDirectionalParticles={4}
        linkDirectionalParticleSpeed={0.014}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleColor={(l: { color?: string }) =>
          typeof l.color === "string" ? l.color : LINK_PARTICLE_COLOR
        }
        linkCurvature={0.18}
        cooldownTicks={0}
        warmupTicks={0}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.35}
        enableNodeDrag={hasDraggableNodes}
        showNavInfo={false}
        onNodeDrag={(node: any) => {
          if (node.kgDraggable) return;
          snapGraphNodeToLayoutLock(node);
        }}
        onNodeClick={(node: any) => props.onNodeClick?.(node)}
        onBackgroundClick={() => props.onBackgroundClick?.()}
        onEngineStop={() => {
          if (didInitialFitRef.current) return;
          didInitialFitRef.current = true;
          if (props.focusNodeId?.trim()) return;
          fitCameraToNodeLayout(
            fgMethodsRef.current as ForceGraphRef | null,
            props.nodes,
            size.width,
            size.height,
            48,
            0
          );
        }}
      />
    </div>
  );
}
