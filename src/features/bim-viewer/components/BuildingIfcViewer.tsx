"use client";

import type { ModelIdMap } from "@thatopen/components";
import { RenderedFaces } from "@thatopen/fragments";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

/** Hard cap for `ifcLoader.load` — large IFCs can exceed a few minutes on a laptop. */
const IFC_LOAD_TIMEOUT_MS = 600_000;

/** Non-focused elements when ghosting is active (subset `setOpacity` path). */
const IFC_GHOST_OPACITY = 0.11;

/** Selection outline color (cyan). */
const IFC_FOCUS_HIGHLIGHT_HEX = 0x22d3ee;

/**
 * Camera distance from merged-bbox center uses `maxDim * factor * padding`.
 * Lower factor = larger on screen. Offset dir (~0.85,0.45,0.85) has length ~1.28, so the old
 * 3.05 factor sat far from the model; ~1.4 uses the canvas better while staying off the edges.
 */
const IFC_FOCUS_DISTANCE_FACTOR = 1.42;
/** Slight extra margin so geometry does not clip the canvas (safety whitespace). */
const IFC_FOCUS_VIEW_PADDING = 1.06;

/** Initial full-model frame after load (same padding); tighter than legacy 1.8×. */
const IFC_INITIAL_FRAME_FACTOR = 1.08;

export type BuildingIfcViewerStatus = "idle" | "loading" | "ready" | "error";

export type BuildingIfcViewerStatusPayload = {
  status: BuildingIfcViewerStatus;
  message: string;
};

export type BuildingIfcViewerHandle = {
  /** Ghost all geometry (same opacity as non-focused ghost pass); clears highlight. */
  activateWholeGraphAlpha: () => Promise<void>;
  /** Full reset: highlight off + `resetOpacity`. Clears manual whole-graph alpha mode. */
  resetFullVisuals: () => Promise<void>;
  getAlphaDebugSnapshot: () => Record<string, unknown>;
};

type FocusCtx = {
  model: any;
  world: any;
  fragments: any;
};

/** Clear highlight + restore default IFC opacity (no selection). */
async function resetIfcFocusVisualsFull(ctx: FocusCtx) {
  const { model, fragments } = ctx;
  try {
    await fragments.resetHighlight();
  } catch {
    /* noop */
  }
  try {
    if (typeof model.resetOpacity === "function") {
      await model.resetOpacity(undefined);
    }
  } catch {
    /* noop */
  }
}

/** Only drop highlight overlay — do not `resetOpacity` here (avoids fighting the next ghost pass and races with the worker). */
async function resetIfcHighlightOnly(ctx: FocusCtx) {
  try {
    await ctx.fragments.resetHighlight();
  } catch {
    /* noop */
  }
}

/**
 * Ghost + highlight. `focusExpressIds` may contain many local ids (IFC type group visualizer).
 */
async function applyFocusGhostHighlightOnly(
  ctx: FocusCtx,
  focusExpressIds: number[],
  idsWithGeom: number[]
) {
  const focusSet = new Set(focusExpressIds);
  if (focusSet.size === 0) return;

  console.log("[BuildingIfcViewer][alpha] applyFocusGhostHighlightOnly", {
    focusCount: focusExpressIds.length,
    geomCount: idsWithGeom.length,
    ghostNonFocus: idsWithGeom.length > 1,
  });

  const { model, fragments } = ctx;
  const geomSet = new Set(idsWithGeom);
  const hasGeomIndex = idsWithGeom.length > 0;
  const anyInGeom = [...focusSet].some((id) => !hasGeomIndex || geomSet.has(id));
  if (hasGeomIndex && !anyInGeom) return;

  if (idsWithGeom.length > 1) {
    const others = idsWithGeom.filter((id) => !focusSet.has(id));
    if (others.length && typeof model.setOpacity === "function") {
      try {
        await model.setOpacity(others, IFC_GHOST_OPACITY);
      } catch (e) {
        console.warn("[BuildingIfcViewer] ghost setOpacity", e);
      }
    }
  }
  if (typeof model.setOpacity === "function") {
    try {
      await model.setOpacity([...focusSet], 1);
    } catch {
      /* noop */
    }
  }

  const mid = model.modelId as string;
  const map: ModelIdMap = { [mid]: focusSet };
  try {
    await fragments.highlight(
      {
        color: new THREE.Color(IFC_FOCUS_HIGHLIGHT_HEX),
        renderedFaces: RenderedFaces.TWO,
        opacity: 0.92,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      },
      map
    );
  } catch {
    /* highlight is optional */
  }
}

/** Debug: fade every item that has mesh geometry (no selection highlight). */
async function applyWholeGraphAlphaMode(ctx: FocusCtx) {
  const { model, fragments } = ctx;
  console.log("[BuildingIfcViewer][alpha] applyWholeGraphAlphaMode start");
  try {
    await fragments.resetHighlight();
  } catch {
    /* noop */
  }
  let ids: number[] = [];
  if (typeof model.getItemsIdsWithGeometry === "function") {
    try {
      ids = await model.getItemsIdsWithGeometry();
    } catch {
      ids = [];
    }
  }
  console.log("[BuildingIfcViewer][alpha] applyWholeGraphAlphaMode geometry", {
    count: ids.length,
    opacity: IFC_GHOST_OPACITY,
  });
  if (ids.length > 0 && typeof model.setOpacity === "function") {
    try {
      await model.setOpacity(ids, IFC_GHOST_OPACITY);
    } catch (e) {
      console.warn("[BuildingIfcViewer][alpha] whole-graph setOpacity failed", e);
    }
  }
}

async function focusCameraOnExpressIds(
  ctx: FocusCtx,
  focusExpressIds: number[] | null,
  geomIdsCache: MutableRefObject<number[]>,
  ghostQueueRef: MutableRefObject<((op: () => Promise<void>) => Promise<void>) | null>,
  debugManualWholeAlphaRef: MutableRefObject<boolean>,
  shouldAbort?: () => boolean
) {
  const { model, world, fragments } = ctx;

  if (focusExpressIds == null || focusExpressIds.length === 0) {
    debugManualWholeAlphaRef.current = false;
    console.log("[BuildingIfcViewer][alpha] focusCameraOnExpressIds: clear → full reset");
    await resetIfcFocusVisualsFull(ctx);
    if (shouldAbort?.()) return;
    geomIdsCache.current = [];
    return;
  }

  if (debugManualWholeAlphaRef.current) {
    console.log(
      "[BuildingIfcViewer][alpha] focusCameraOnExpressIds: exiting manual whole-graph alpha (focus targets set)"
    );
  }
  debugManualWholeAlphaRef.current = false;
  console.log("[BuildingIfcViewer][alpha] focusCameraOnExpressIds: focus", {
    targetCount: focusExpressIds.length,
    head: focusExpressIds.slice(0, 8),
  });

  await resetIfcHighlightOnly(ctx);
  if (shouldAbort?.()) return;

  let idsWithGeom: number[] = [];
  if (typeof model.getItemsIdsWithGeometry === "function") {
    try {
      idsWithGeom = await model.getItemsIdsWithGeometry();
    } catch {
      idsWithGeom = [];
    }
  }
  geomIdsCache.current = idsWithGeom;

  const focusSet = new Set(focusExpressIds);
  if (idsWithGeom.length > 0) {
    const overlap = focusExpressIds.some((id) => idsWithGeom.includes(id));
    if (!overlap) {
      console.warn(
        "[BuildingIfcViewer] no focus expressId intersects items with geometry",
        focusExpressIds.slice(0, 8)
      );
      geomIdsCache.current = [];
      return;
    }
  }

  if (fragments.core && typeof fragments.core.update === "function") {
    await fragments.core.update(true);
  }
  if (shouldAbort?.()) return;
  if (typeof model.update === "function") {
    await model.update(true);
  }
  if (shouldAbort?.()) return;

  const box = await model.getMergedBox(focusExpressIds);
  if (box.isEmpty()) {
    console.warn("[BuildingIfcViewer] empty merged bbox for expressIds", focusExpressIds.length);
    return;
  }
  if (shouldAbort?.()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.1);
  const distance = maxDim * IFC_FOCUS_DISTANCE_FACTOR * IFC_FOCUS_VIEW_PADDING;
  world.camera.controls.setLookAt(
    center.x + distance * 0.85,
    center.y + distance * 0.45,
    center.z + distance * 0.85,
    center.x,
    center.y,
    center.z,
    true
  );

  if (shouldAbort?.()) return;

  const runApply = () => applyFocusGhostHighlightOnly(ctx, focusExpressIds, idsWithGeom);
  const enq = ghostQueueRef.current;
  if (enq) await enq(runApply);
  else await runApply();
}

type Props = {
  projectId: string;
  ifcSource: "project" | "test";
  /** IFC local id (same as web-ifc express id) — zoom + highlight when set. */
  focusExpressId?: number | null;
  /**
   * When non-empty, highlights and frames all these ids together (e.g. IFC type group).
   * Takes precedence over `focusExpressId`.
   */
  focusExpressIds?: number[] | null;
  /** Shown in the parent toolbar instead of below the canvas. */
  onStatusChange?: (payload: BuildingIfcViewerStatusPayload) => void;
  className?: string;
};

const BuildingIfcViewer = forwardRef<BuildingIfcViewerHandle, Props>(function BuildingIfcViewer(
  {
    projectId,
    ifcSource,
    focusExpressId = null,
    focusExpressIds = null,
    onStatusChange,
    className = "",
  }: Props,
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadRunRef = useRef(0);
  const focusCtxRef = useRef<FocusCtx | null>(null);
  /** Geometry ids from last full focus; reapply ghost after fragments.core.update clears materials. */
  const geomIdsCacheRef = useRef<number[]>([]);
  const focusExpressIdRef = useRef<number | null>(null);
  const focusExpressIdsRef = useRef<number[] | null>(null);
  /** Serializes ghost/highlight so interval + controls + focus never interleave `setOpacity`. */
  const ghostQueueRef = useRef<((op: () => Promise<void>) => Promise<void>) | null>(null);
  /** Invalidates in-flight focus when expressId(s) change so stale runs do not clear geom cache / opacity. */
  const focusGenerationRef = useRef(0);
  /** When true, keep-alive / debounced ghost reapplies whole-model alpha instead of focus ghost. */
  const debugManualWholeAlphaRef = useRef(false);
  focusExpressIdRef.current = focusExpressId ?? null;
  focusExpressIdsRef.current =
    focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds : null;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const [status, setStatus] = useState<BuildingIfcViewerStatus>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    onStatusChangeRef.current?.({ status, message });
  }, [status, message]);

  useEffect(() => {
    return () => {
      onStatusChangeRef.current?.({ status: "idle", message: "" });
    };
  }, []);

  useEffect(() => {
    loadRunRef.current += 1;
    const runId = loadRunRef.current;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const first = typeof args[0] === "string" ? args[0] : "";
      if (first.includes("THREE.THREE.Clock: This module has been deprecated")) {
        return;
      }
      originalWarn(...args);
    };

    const run = async () => {
      const startedAt = performance.now();
      const debug = (...args: unknown[]) => console.log("[BuildingIfcViewer]", `run#${runId}`, ...args);
      let stallNoticeTimer: number | undefined;
      let stallProgressInterval: number | undefined;
      let loadTimeoutTimer: number | undefined;
      setStatus("loading");
      setMessage("Loading viewer components...");
      try {
        const container = containerRef.current;
        if (!container) return;
        // Prevent duplicate canvases after Fast Refresh / effect remounts.
        container.replaceChildren();
        const origin = window.location.origin;
        const wasmBaseUrl = `${origin}/wasm/`;
        debug("start", { projectId, origin, wasmBaseUrl });

        const OBC = await import("@thatopen/components");
        debug("components imported");

        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          InstanceType<typeof OBC.SimpleScene>,
          InstanceType<typeof OBC.SimpleCamera>,
          InstanceType<typeof OBC.SimpleRenderer>
        >();

        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container);
        world.camera = new OBC.SimpleCamera(components);
        components.init();
        world.scene.setup();
        world.scene.three.add(new THREE.AxesHelper(2));
        world.camera.controls.setLookAt(12, 10, 12, 0, 0, 0);
        debug("world initialized");

        setMessage("Initializing local fragments worker...");
        const fragments = components.get(OBC.FragmentsManager);
        const workerUrl = `${origin}/api/fragments-worker`;
        debug("fragments.init", { workerUrl });
        fragments.init(workerUrl);
        const attachModelObject = (entry: { value?: any } | any) => {
          const candidate = entry?.value ?? entry;
          const obj = candidate?.object;
          if (obj && obj.parent !== world.scene.three) {
            world.scene.three.add(obj);
            debug("attached fragments model object", {
              modelId: candidate?.modelId,
              children: obj.children?.length ?? 0,
              type: obj.type,
              sceneChildren: world.scene.three.children.length,
            });
          }
        };
        const attachAllKnownModels = () => {
          for (const model of fragments.list.values()) {
            attachModelObject(model);
          }
        };
        const logFragmentsSnapshot = (label: string) => {
          const models = Array.from(fragments.list.values());
          debug(label, {
            modelCount: models.length,
            sceneChildren: world.scene.three.children.length,
            models: models.slice(0, 6).map((m: any) => ({
              modelId: m?.modelId,
              hasObject: Boolean(m?.object),
              objectType: m?.object?.type,
              objectChildren: m?.object?.children?.length ?? 0,
              isBusy: Boolean(m?.isBusy),
            })),
          });
        };
        // Attach models added asynchronously by fragments manager.
        const onItemSet = (entry: { key: string; value: any }) => {
          const value = entry?.value;
          debug("fragments.list onItemSet", {
            key: entry?.key,
            modelId: value?.modelId,
            objectType: value?.object?.type,
            objectChildren: value?.object?.children?.length ?? 0,
            isBusy: Boolean(value?.isBusy),
            listSize: Array.from(fragments.list.values()).length,
          });
          attachModelObject(entry);
        };
        const onFragmentsLoaded = () => {
          attachAllKnownModels();
          logFragmentsSnapshot("fragments snapshot (onFragmentsLoaded)");
        };
        fragments.list.onItemSet.add(onItemSet);
        fragments.onFragmentsLoaded.add(onFragmentsLoaded);
        // Attach already-present models (if any).
        attachAllKnownModels();
        logFragmentsSnapshot("fragments snapshot (post-init)");

        const ifcLoader = components.get(OBC.IfcLoader);
        setMessage("Checking IFC WASM files...");
        const wasmCandidates = [`${origin}/wasm/web-ifc.wasm`, `${origin}/wasm/web-ifc-mt.wasm`];
        let resolvedWasmUrl: string | null = null;
        for (const candidate of wasmCandidates) {
          const res = await fetch(candidate, { method: "HEAD" });
          debug("wasm HEAD", { candidate, status: res.status, ok: res.ok });
          if (res.ok) {
            resolvedWasmUrl = candidate;
            break;
          }
        }
        if (!resolvedWasmUrl) {
          throw new Error("Missing local IFC WASM under /public/wasm.");
        }

        setMessage("Configuring local IFC WASM...");
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            // Keep browser-side WASM local to avoid CDN/CORS/runtime mismatch issues.
            path: wasmBaseUrl,
            absolute: true,
          },
          customLocateFileHandler: (url) => {
            if (typeof url === "string" && url.includes("mt")) {
              return `${origin}/wasm/web-ifc-mt.wasm`;
            }
            return resolvedWasmUrl ?? `${origin}/wasm/web-ifc.wasm`;
          },
        });
        debug("ifcLoader.setup done", { resolvedWasmUrl });

        // Critical in Next.js/Turbopack: explicitly initialize web-ifc before load().
        // Relying on lazy init inside load() can race and fail in browser runtime.
        setMessage("Initializing web-ifc runtime...");
        const webIfc: any = (ifcLoader as any).webIfc;
        if (!webIfc || typeof webIfc.Init !== "function") {
          throw new Error("web-ifc API unavailable on IfcLoader.");
        }
        if (typeof webIfc.SetWasmPath === "function") {
          webIfc.SetWasmPath(wasmBaseUrl, true);
          debug("webIfc.SetWasmPath", { wasmBaseUrl });
        }
        const initStart = performance.now();
        await webIfc.Init();
        debug("webIfc.Init done", {
          ms: Math.round(performance.now() - initStart),
          hasOpenModel: typeof webIfc.OpenModel === "function",
        });

        // Give Emscripten runtime a brief tick to settle before OpenModel/load.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (typeof webIfc.OpenModel !== "function") {
          throw new Error("web-ifc runtime not ready after Init().");
        }

        setMessage("Downloading IFC...");
        let fileRes: Response;
        if (ifcSource === "test") {
          const testIfcUrl = "/ifc/test.ifc";
          fileRes = await fetch(testIfcUrl);
          debug("ifc fetch (test)", { url: testIfcUrl, status: fileRes.status });
          if (!fileRes.ok) {
            throw new Error("Local test IFC missing at /public/ifc/test.ifc.");
          }
        } else {
          const projectIfcUrl = `/api/file?name=${encodeURIComponent(`${projectId}.ifc`)}`;
          fileRes = await fetch(projectIfcUrl);
          debug("ifc fetch (project)", { url: projectIfcUrl, status: fileRes.status });
          if (!fileRes.ok) {
            throw new Error(
              "No IFC file found for this project (`data/<projectId>.ifc`). Import BIM in Phase 1 or switch to Test IFC."
            );
          }
        }
        const bytes = new Uint8Array(await fileRes.arrayBuffer());
        debug("ifc bytes loaded", { source: ifcSource, bytes: bytes.byteLength });
        if (bytes.byteLength > 30 * 1024 * 1024) {
          debug("large IFC detected", {
            bytes: bytes.byteLength,
            approxMb: Number((bytes.byteLength / (1024 * 1024)).toFixed(1)),
          });
        }

        setMessage("Building 3D model...");
        const loadStart = performance.now();
        stallNoticeTimer = window.setTimeout(() => {
          if (!disposed) {
            setMessage("Still loading model... large IFC or degenerate geometry can take longer.");
          }
        }, 12000);
        // Keep user feedback alive for long conversions.
        stallProgressInterval = window.setInterval(() => {
          if (disposed) return;
          const elapsedSec = Math.round((performance.now() - loadStart) / 1000);
          if (elapsedSec >= 30) {
            setMessage(`Still building 3D model... ${elapsedSec}s elapsed.`);
          }
        }, 10000);
        const loadPromise = ifcLoader.load(bytes, false, projectId || "ifc-model", {
          processData: {
            progressCallback: (_progress, data) => {
              if (disposed) return;
              const processed =
                typeof data.entitiesProcessed === "number"
                  ? ` (${data.entitiesProcessed.toLocaleString()} entities)`
                  : "";
              setMessage(`Building 3D model... ${data.process} ${data.state}${processed}`);
            },
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          loadTimeoutTimer = window.setTimeout(() => {
            const sec = Math.round(IFC_LOAD_TIMEOUT_MS / 1000);
            reject(
              new Error(
                `IFC conversion timed out after ${sec}s. The file may be very large or degenerate; try Test IFC or a smaller export.`
              )
            );
          }, IFC_LOAD_TIMEOUT_MS);
        });
        const model = await Promise.race([loadPromise, timeoutPromise]);
        debug("ifcLoader.load done", { ms: Math.round(performance.now() - loadStart) });
        attachModelObject(model);
        attachAllKnownModels();
        logFragmentsSnapshot("fragments snapshot (post-load)");
        debug("model object added", {
          children: model.object.children.length,
          isBusy: (model as any).isBusy,
          type: model.object.type,
          sceneChildren: world.scene.three.children.length,
        });

        // Ensure fragments LOD/culling pipeline is connected to active camera,
        // then force an update before computing bounds.
        if (typeof (model as any).useCamera === "function") {
          (model as any).useCamera(world.camera.three);
          debug("model.useCamera attached");
        }
        if (typeof (model as any).update === "function") {
          const settleStart = performance.now();
          // In this Fragments version, meshes may be materialized lazily by the manager.
          // Force manager and model updates to flush pending tile requests.
          for (let i = 0; i < 40; i += 1) {
            if (disposed) break;
            if (fragments.core && typeof fragments.core.update === "function") {
              await fragments.core.update(true);
            }
            await (model as any).update(true);
            const childrenNow = model.object.children.length;
            const busyNow = Boolean((model as any).isBusy);
            debug("model.update cycle", { cycle: i + 1, childrenNow, busyNow });
            if (childrenNow > 0 && !busyNow) break;
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          attachAllKnownModels();
          logFragmentsSnapshot("fragments snapshot (post-settle)");
          debug("model settle done", {
            settleMs: Math.round(performance.now() - settleStart),
            childrenAfterSettle: model.object.children.length,
            isBusyAfterSettle: (model as any).isBusy,
            sceneChildren: world.scene.three.children.length,
          });
        }

        // Also keep fragments updated while navigating the camera.
        const controls = world.camera.controls;
        /** CameraControls typings omit the usual "change" event; runtime still fires it. */
        type ControlsWithChange = {
          addEventListener(type: string, listener: () => void): void;
          removeEventListener(type: string, listener: () => void): void;
        };
        const controlsEv = controls as unknown as ControlsWithChange;

        let ghostTail = Promise.resolve();
        const enqueueGhost = (op: () => Promise<void>) => {
          const p = ghostTail.then(() => op());
          ghostTail = p.catch(() => {});
          return p;
        };
        ghostQueueRef.current = enqueueGhost;

        let reapplyGhostTimer: number | undefined;
        const scheduleReapplyGhost = () => {
          if (reapplyGhostTimer !== undefined) window.clearTimeout(reapplyGhostTimer);
          reapplyGhostTimer = window.setTimeout(() => {
            const fctx = focusCtxRef.current;
            if (!fctx) return;
            if (debugManualWholeAlphaRef.current) {
              void enqueueGhost(async () => {
                await applyWholeGraphAlphaMode(fctx);
              });
              return;
            }
            const gids = geomIdsCacheRef.current;
            const multi = focusExpressIdsRef.current;
            const single = focusExpressIdRef.current;
            const list =
              multi != null && multi.length > 0
                ? multi
                : single != null
                  ? [single]
                  : null;
            if (list == null || list.length === 0) return;
            void enqueueGhost(() => applyFocusGhostHighlightOnly(fctx, list, gids));
          }, 120);
        };

        let highlightKeepAliveId: number | undefined;
        highlightKeepAliveId = window.setInterval(() => {
          const fctx = focusCtxRef.current;
          if (!fctx) return;
          if (debugManualWholeAlphaRef.current) {
            void enqueueGhost(async () => {
              await applyWholeGraphAlphaMode(fctx);
            });
            return;
          }
          const gids = geomIdsCacheRef.current;
          const multi = focusExpressIdsRef.current;
          const single = focusExpressIdRef.current;
          const list =
            multi != null && multi.length > 0
              ? multi
              : single != null
                ? [single]
                : null;
          if (list == null || list.length === 0) return;
          void enqueueGhost(() => applyFocusGhostHighlightOnly(fctx, list, gids));
        }, 3200);

        const onControlRest = () => {
          void fragments.core.update(false).then(() => scheduleReapplyGhost());
        };
        const onControlChange = () => {
          void fragments.core.update(false).then(() => scheduleReapplyGhost());
        };
        controlsEv.addEventListener("rest", onControlRest);
        controlsEv.addEventListener("change", onControlChange);

        // Pump fragments updates for a while after load so tiles/materialized meshes
        // can be requested and attached even when the camera is initially static.
        let frameUpdates = 0;
        let rafId = 0;
        const tickFragments = () => {
          frameUpdates += 1;
          void fragments.core.update(false).then(() => {
            if (frameUpdates % 30 === 0) scheduleReapplyGhost();
          });
          if (frameUpdates % 60 === 0) {
            debug("fragments heartbeat", {
              frameUpdates,
              modelChildren: model.object.children.length,
              modelBusy: Boolean((model as any).isBusy),
              sceneChildren: world.scene.three.children.length,
              knownModels: Array.from(fragments.list.values()).map((m: any) => ({
                modelId: m?.modelId,
                objectChildren: m?.object?.children?.length ?? 0,
                isBusy: Boolean(m?.isBusy),
              })),
            });
          }
          // ~8 seconds at 60fps is usually enough for first visible tiles.
          if (frameUpdates < 480) {
            rafId = window.requestAnimationFrame(tickFragments);
          } else {
            debug("fragments heartbeat done", {
              frameUpdates,
              modelChildren: model.object.children.length,
              modelBusy: Boolean((model as any).isBusy),
            });
          }
        };
        rafId = window.requestAnimationFrame(tickFragments);

        let geometryItemCount = 0;
        if (typeof (model as any).getItemsIdsWithGeometry === "function") {
          try {
            const items = await (model as any).getItemsIdsWithGeometry();
            geometryItemCount = Array.isArray(items) ? items.length : 0;
          } catch {
            geometryItemCount = 0;
          }
        }

        // If geometry exists but object children are still empty, wait a bit longer
        // for the async fragments materialization before computing bbox/framing.
        if (geometryItemCount > 0 && model.object.children.length === 0) {
          const waitStart = performance.now();
          for (let i = 0; i < 120; i += 1) {
            if (disposed) break;
            await fragments.core.update(true);
            if (model.object.children.length > 0) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          debug("post-geometry wait done", {
            waitMs: Math.round(performance.now() - waitStart),
            childrenAfterWait: model.object.children.length,
            modelBusyAfterWait: Boolean((model as any).isBusy),
            geometryItemCount,
          });
        }

        // Auto-frame the loaded building so it's visible immediately.
        const bbox = new THREE.Box3().setFromObject(model.object);
        const objectCount = model.object.children.length;
        if (!bbox.isEmpty()) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 1);
          const distance = maxDim * IFC_INITIAL_FRAME_FACTOR * IFC_FOCUS_VIEW_PADDING;
          world.camera.controls.setLookAt(
            center.x + distance,
            center.y + distance * 0.7,
            center.z + distance,
            center.x,
            center.y,
            center.z,
            true
          );
          setMessage(
            `IFC building loaded. Objects: ${objectCount}. BBox: ${size.x.toFixed(2)} x ${size.y.toFixed(
              2
            )} x ${size.z.toFixed(2)}`
          );
          debug("model bbox", {
            objectCount,
            bbox: { x: size.x, y: size.y, z: size.z },
            totalMs: Math.round(performance.now() - startedAt),
          });
        } else {
          setMessage(
            `IFC loaded but geometry bbox is empty (objects: ${objectCount}, geometry items: ${geometryItemCount}).`
          );
          debug("empty bbox after load", {
            objectCount,
            geometryItemCount,
            totalMs: Math.round(performance.now() - startedAt),
          });
        }

        if (disposed) return;
        focusCtxRef.current = { model, world, fragments };
        setStatus("ready");

        cleanup = () => {
          try {
            debug("cleanup begin");
            debugManualWholeAlphaRef.current = false;
            focusCtxRef.current = null;
            ghostQueueRef.current = null;
            geomIdsCacheRef.current = [];
            if (reapplyGhostTimer !== undefined) window.clearTimeout(reapplyGhostTimer);
            if (highlightKeepAliveId !== undefined) window.clearInterval(highlightKeepAliveId);
            window.cancelAnimationFrame(rafId);
            fragments.list.onItemSet.remove(onItemSet);
            fragments.onFragmentsLoaded.remove(onFragmentsLoaded);
            controlsEv.removeEventListener("rest", onControlRest);
            controlsEv.removeEventListener("change", onControlChange);
            components.dispose();
            container.replaceChildren();
            debug("cleanup done", {
              totalMs: Math.round(performance.now() - startedAt),
            });
          } catch {
            // noop
          }
        };
      } catch (e) {
        if (disposed) return;
        console.error("[BuildingIfcViewer]", `run#${runId}`, "load failed", e);
        setStatus("error");
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        if (stallNoticeTimer != null) window.clearTimeout(stallNoticeTimer);
        if (stallProgressInterval != null) window.clearInterval(stallProgressInterval);
        if (loadTimeoutTimer != null) window.clearTimeout(loadTimeoutTimer);
      }
    };

    void run();
    return () => {
      console.warn = originalWarn;
      disposed = true;
      ghostQueueRef.current = null;
      console.log("[BuildingIfcViewer]", `run#${runId}`, "effect cleanup");
      if (cleanup) cleanup();
    };
  }, [projectId, ifcSource]);

  const focusExpressIdsKey =
    focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds.join(",") : "";

  useEffect(() => {
    const ctx = focusCtxRef.current;
    if (!ctx || status !== "ready") return;
    const multi =
      focusExpressIds != null && focusExpressIds.length > 0 ? focusExpressIds : null;
    const single = focusExpressId ?? null;
    const targets = multi ?? (single != null ? [single] : null);
    focusGenerationRef.current += 1;
    const gen = focusGenerationRef.current;
    const shouldAbort = () => gen !== focusGenerationRef.current;
    void (async () => {
      try {
        await focusCameraOnExpressIds(
          ctx,
          targets,
          geomIdsCacheRef,
          ghostQueueRef,
          debugManualWholeAlphaRef,
          shouldAbort
        );
      } catch (e) {
        console.warn("[BuildingIfcViewer] focus expressId(s)", e);
      }
    })();
    return () => {
      focusGenerationRef.current += 1;
    };
  }, [focusExpressId, focusExpressIdsKey, status]);

  useImperativeHandle(
    ref,
    () => ({
      activateWholeGraphAlpha: async () => {
        const ctx = focusCtxRef.current;
        const enq = ghostQueueRef.current;
        console.log("[BuildingIfcViewer][alpha] API activateWholeGraphAlpha", {
          hasCtx: Boolean(ctx),
          hasQueue: Boolean(enq),
          status,
        });
        if (!ctx || !enq) {
          console.warn("[BuildingIfcViewer][alpha] activateWholeGraphAlpha: viewer not ready");
          return;
        }
        debugManualWholeAlphaRef.current = true;
        await enq(async () => {
          await applyWholeGraphAlphaMode(ctx);
        });
      },
      resetFullVisuals: async () => {
        const ctx = focusCtxRef.current;
        const enq = ghostQueueRef.current;
        console.log("[BuildingIfcViewer][alpha] API resetFullVisuals", {
          hasCtx: Boolean(ctx),
          status,
        });
        debugManualWholeAlphaRef.current = false;
        if (!ctx) return;
        if (enq) {
          await enq(async () => {
            await resetIfcFocusVisualsFull(ctx);
          });
        } else {
          await resetIfcFocusVisualsFull(ctx);
        }
      },
      getAlphaDebugSnapshot: () => ({
        status,
        message,
        hasFocusCtx: focusCtxRef.current != null,
        debugWholeGraphAlphaMode: debugManualWholeAlphaRef.current,
        geomIdsCacheLength: geomIdsCacheRef.current.length,
        focusExpressId: focusExpressIdRef.current,
        focusExpressIdsHead:
          focusExpressIdsRef.current != null
            ? focusExpressIdsRef.current.slice(0, 16)
            : null,
        focusExpressIdsTotal: focusExpressIdsRef.current?.length ?? 0,
      }),
    }),
    [message, status]
  );

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-0 w-full rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 ${className}`.trim()}
    />
  );
});

BuildingIfcViewer.displayName = "BuildingIfcViewer";

export default BuildingIfcViewer;
