"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Props = {
  projectId: string;
  ifcSource: "project" | "test";
};

export default function BuildingIfcViewer({ projectId, ifcSource }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadRunRef = useRef(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string>("Preparing IFC viewer...");

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
      setStatus("loading");
      setMessage("Loading viewer components...");
      try {
        const container = containerRef.current;
        if (!container) return;
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
            const fallbackIfcUrl = `/api/file?name=${encodeURIComponent("IFC Schependomlaan.ifc")}`;
            fileRes = await fetch(fallbackIfcUrl);
            debug("ifc fetch (fallback)", { url: fallbackIfcUrl, status: fileRes.status });
          }
          if (!fileRes.ok) {
            throw new Error("No IFC file found for this project.");
          }
        }
        const bytes = new Uint8Array(await fileRes.arrayBuffer());
        debug("ifc bytes loaded", { source: ifcSource, bytes: bytes.byteLength });

        setMessage("Building 3D model...");
        const longLoadTimer = window.setTimeout(() => {
          if (!disposed) {
            setMessage("Still loading model... large IFC or degenerate geometry can take longer.");
          }
        }, 12000);
        const loadStart = performance.now();
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
          window.setTimeout(() => {
            reject(
              new Error(
                "IFC conversion timed out after 180s. Model may be too heavy/degenerate for current MVP settings."
              )
            );
          }, 180000);
        });
        const model = await Promise.race([loadPromise, timeoutPromise]);
        debug("ifcLoader.load done", { ms: Math.round(performance.now() - loadStart) });
        window.clearTimeout(longLoadTimer);
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
        const onControlRest = () => {
          void fragments.core.update(false);
        };
        const onControlChange = () => {
          void fragments.core.update(false);
        };
        controls.addEventListener("rest", onControlRest);
        controls.addEventListener("change", onControlChange);

        // Pump fragments updates for a while after load so tiles/materialized meshes
        // can be requested and attached even when the camera is initially static.
        let frameUpdates = 0;
        let rafId = 0;
        const tickFragments = () => {
          frameUpdates += 1;
          void fragments.core.update(false);
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
          const distance = maxDim * 1.8;
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
        setStatus("ready");

        cleanup = () => {
          try {
            debug("cleanup begin");
            window.cancelAnimationFrame(rafId);
            fragments.list.onItemSet.remove(onItemSet);
            fragments.onFragmentsLoaded.remove(onFragmentsLoaded);
            controls.removeEventListener("rest", onControlRest);
            controls.removeEventListener("change", onControlChange);
            components.dispose();
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
      }
    };

    void run();
    return () => {
      console.warn = originalWarn;
      disposed = true;
       console.log("[BuildingIfcViewer]", `run#${runId}`, "effect cleanup");
      if (cleanup) cleanup();
    };
  }, [projectId, ifcSource]);

  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        Building view:{" "}
        {status === "ready" ? "Ready" : status === "error" ? "Error" : "Loading"}
      </div>
      <div
        ref={containerRef}
        className="h-[68vh] min-h-[24rem] w-full rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950"
      />
      <div className="text-xs text-zinc-600 dark:text-zinc-300">{message}</div>
    </div>
  );
}
