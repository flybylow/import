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

function normalizeLinkEndpoint(ref: unknown): string {
  if (ref == null) return "";
  if (typeof ref === "object" && "id" in (ref as object)) {
    return String((ref as { id: unknown }).id);
  }
  return String(ref);
}

/** Clone links with string endpoints — the graph mutates link objects in place; sharing the parent array breaks re-entry. */
function cloneGraphLinks(links: KGLink[]): KGLink[] {
  return links.map((l) => ({
    source: normalizeLinkEndpoint(l.source as unknown),
    target: normalizeLinkEndpoint(l.target as unknown),
    ...(typeof l.color === "string" ? { color: l.color } : {}),
  }));
}

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
  /** Per react-force-graph README: zoomToFit([ms], [paddingPx], [nodeFilterFn]) — 3D supported. */
  zoomToFit?: (transitionMs?: number, paddingPx?: number, nodeFilterFn?: (node: unknown) => boolean) => void;
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
  spanX: number;
  spanY: number;
  spanZ: number;
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
  return {
    cx,
    cy,
    cz,
    radius: Math.max(halfDiag, 8),
    spanX: dx,
    spanY: dy,
    spanZ: dz,
  };
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

  /** Timeline spines are long on X with small Y/Z; a view along X collapses all links into one streak. */
  const sx = b.spanX;
  const sy = b.spanY;
  const sz = b.spanZ;
  const dom = Math.max(sx, sy, sz, 1);
  if (sx >= dom * 0.85 && sy < dom * 0.45 && sz < dom * 0.45) {
    dx = 0.5;
    dy = 0.38;
    dz = 0.78;
    len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
  }

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

function linkEndpointId(link: { source?: unknown; target?: unknown }, end: "source" | "target"): string {
  const v = link[end];
  if (v && typeof v === "object" && v !== null && "id" in (v as object)) {
    return String((v as { id: string }).id);
  }
  return String(v ?? "");
}

/** Slight per-link curvature so many parallel timeline edges do not read as one tube. */
function fixedLayoutLinkCurvature(link: { source?: unknown; target?: unknown }): number {
  const k = `${linkEndpointId(link, "source")}|${linkEndpointId(link, "target")}`;
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 2 ** 32;
  return 0.07 + u * 0.2;
}

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
  /**
   * Native d3-force-3d layout (react-force-graph defaults: no preset coords, cooldownTicks ∞,
   * drag reheats simulation). Timeline “spine” mode uses the opposite: frozen coords + cooldownTicks 0.
   * @see https://github.com/vasturiano/react-force-graph#force-engine-configuration
   */
  forceDirected?: boolean;
}) {
  const { nodes, links, graphOuterClassName, forceDirected } = props;
  const { ref, size } = useContainerSize();
  const fgMethodsRef = useRef<any>(null);
  const didInitialFitRef = useRef(false);

  const hasDraggableSatellites = useMemo(() => nodes.some((n) => n.draggable === true), [nodes]);

  const graph = useMemo(() => {
    const linkData = cloneGraphLinks(links);
    if (forceDirected) {
      // No x/y/z/fx/fy/fz — let d3-force-3d assign positions (see react-force-graph README).
      return {
        nodes: nodes.map((n) => ({
          id: n.id,
          label: n.label,
          kind: n.kind,
          val: n.val,
          color: n.color,
          meta: n.meta,
        })),
        links: linkData,
      };
    }
    return {
      nodes: nodes.map((n) => {
        const z =
          typeof n.z === "number" && Number.isFinite(n.z) ? n.z : 0;
        // Set x/y/z as well as fx/fy/fz: link rendering checks `start.hasOwnProperty('x')` before
        // drawing; with cooldownTicks=0 the first tickFrame may not run d3.tick(), so coordinates
        // must exist on the node objects from the start.
        return {
          id: n.id,
          label: n.label,
          kind: n.kind,
          x: n.x,
          y: n.y,
          z,
          fx: n.x,
          fy: n.y,
          fz: z,
          val: n.val,
          color: n.color,
          meta: n.meta,
          kgDraggable: n.draggable === true,
          __layoutLock: { x: n.x, y: n.y, z },
        };
      }),
      links: linkData,
    };
  }, [nodes, links, forceDirected]);

  useEffect(() => {
    didInitialFitRef.current = false;
  }, [nodes, links, forceDirected]);

  useEffect(() => {
    const id = props.focusNodeId?.trim();
    if (!id) return;
    let raf = 0;
    const run = () => {
      raf = requestAnimationFrame(() => {
        const fg = fgMethodsRef.current as ForceGraphRef | null;
        const subset = props.nodes.filter((n) => n.id === id);
        if (subset.length === 0) return;
        if (forceDirected) {
          fg?.zoomToFit?.(500, 72, (n: unknown) => (n as { id?: string })?.id === id);
          return;
        }
        fitCameraToNodeLayout(fg, subset, size.width, size.height, 72, 500);
      });
    };
    const t = window.setTimeout(run, 100);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [props.focusNodeId, props.nodes, size.width, size.height, forceDirected]);

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
            const fg = fgMethodsRef.current as ForceGraphRef | null;
            if (forceDirected) {
              fg?.zoomToFit?.(0, 56);
              return;
            }
            fitCameraToNodeLayout(fg, props.nodes, size.width, size.height, 56, 0);
          }}
        >
          Fit
        </button>
        <p className="max-w-[11rem] text-right text-[10px] text-zinc-500 dark:text-zinc-400">
          {forceDirected
            ? "Force layout (d3) · drag reheats sim · orbit background · scroll zoom"
            : hasDraggableSatellites
              ? "Drag note bubbles to move · drag background to orbit · scroll zoom"
              : "Drag to rotate · scroll to zoom"}
        </p>
      </div>
      {/*
        Remount when switching timeline-fixed vs force-3d. Otherwise three-forcegraph keeps prior
        node positions / fixed coords and the graph looks like a flat 2D spine inside the 3D canvas.
      */}
      <ForceGraph3D
        key={forceDirected ? "mode-force-3d" : "mode-timeline-fixed"}
        ref={fgMethodsRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        graphData={graph as any}
        numDimensions={3}
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
        linkDirectionalParticles={forceDirected ? 3 : 4}
        linkDirectionalParticleSpeed={0.014}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleColor={(l: { color?: string }) =>
          typeof l.color === "string" ? l.color : LINK_PARTICLE_COLOR
        }
        linkCurvature={forceDirected ? 0 : (l: { source?: unknown; target?: unknown }) => fixedLayoutLinkCurvature(l)}
        cooldownTicks={forceDirected ? Number.POSITIVE_INFINITY : 0}
        /**
         * Timeline / fixed-layout: `cooldownTicks={0}` stops the engine on the first frame, so the
         * per-frame `tick()` branch never runs. d3-force still needs at least a few warmup ticks here
         * so `forceLink` replaces string `source`/`target` with node objects — otherwise
         * three-forcegraph skips every link (`!start.hasOwnProperty('x')`) and edges disappear.
         */
        warmupTicks={forceDirected ? 160 : 64}
        {...(forceDirected ? {} : { d3AlphaDecay: 0.02, d3VelocityDecay: 0.35 })}
        enableNodeDrag={forceDirected ? true : hasDraggableSatellites}
        showNavInfo={false}
        onNodeDrag={
          forceDirected
            ? undefined
            : (node: any) => {
                if (node.kgDraggable) return;
                snapGraphNodeToLayoutLock(node);
              }
        }
        onNodeClick={(node: any) => props.onNodeClick?.(node)}
        onBackgroundClick={() => props.onBackgroundClick?.()}
        onEngineStop={() => {
          if (didInitialFitRef.current) return;
          const focus = props.focusNodeId?.trim();
          if (focus) {
            didInitialFitRef.current = true;
            return;
          }
          // Engine can stop on the first frame (cooldownTicks=0 for timeline). Ref to the kapsule
          // instance is not always ready in that same tick — wait until we can actually move camera.
          let attempts = 20;
          const runInitialFit = () => {
            if (didInitialFitRef.current) return;
            const fg = fgMethodsRef.current as ForceGraphRef | null;
            const ready = fg != null;
            if (!ready && attempts-- > 0) {
              requestAnimationFrame(runInitialFit);
              return;
            }
            didInitialFitRef.current = true;
            if (forceDirected) {
              fg?.zoomToFit?.(0, 48);
              return;
            }
            fitCameraToNodeLayout(fg, props.nodes, size.width, size.height, 48, 0);
          };
          runInitialFit();
        }}
      />
    </div>
  );
}
