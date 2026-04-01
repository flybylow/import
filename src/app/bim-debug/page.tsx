"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import ProjectIdField from "@/components/ProjectIdField";
import { useProjectId } from "@/lib/useProjectId";

type SourceMode = "project" | "test";

type IfcStats = {
  bytes: number;
  projectCount: number;
  productCount: number;
  shapeRepCount: number;
  streamedMeshes: number;
  streamedGeometryRefs: number;
};

export default function BimDebugPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const diagnosticsRunRef = useRef(0);
  const { projectId, setProjectId } = useProjectId();
  const [sourceMode, setSourceMode] = useState<SourceMode>("project");
  const [message, setMessage] = useState("Initializing diagnostics...");
  const [stats, setStats] = useState<IfcStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ifcUrl = useMemo(() => {
    if (sourceMode === "test") return "/ifc/test.ifc";
    return `/api/file?name=${encodeURIComponent(`${projectId}.ifc`)}`;
  }, [projectId, sourceMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(4, 3, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    scene.add(grid);
    const axes = new THREE.AxesHelper(2);
    scene.add(axes);
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(4, 8, 6);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.1, roughness: 0.6 })
    );
    cube.position.set(0, 0.5, 0);
    scene.add(cube);

    let raf = 0;
    const render = () => {
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(render);
    };
    render();

    const onResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [projectId, sourceMode]);

  useEffect(() => {
    let cancelled = false;
    diagnosticsRunRef.current += 1;
    const runId = diagnosticsRunRef.current;
    const startedAt = performance.now();
    const debug = (...args: unknown[]) => console.log("[BimDebugPage]", `run#${runId}`, ...args);

    debug("diagnostics effect start", { ifcUrl, projectId, sourceMode });
    setError(null);
    setStats(null);

    const run = async () => {
      try {
        setMessage(`Fetching IFC from ${ifcUrl} ...`);
        debug("fetch IFC start", { ifcUrl });
        const res = await fetch(ifcUrl);
        debug("fetch IFC done", { status: res.status, ok: res.ok });
        if (!res.ok) {
          throw new Error(`IFC fetch failed: ${res.status} ${res.statusText}`);
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        debug("bytes loaded", { bytes: bytes.byteLength });
        if (cancelled) return;

        setMessage("Initializing web-ifc parser...");
        const WebIFC: any = await import("web-ifc");
        debug("web-ifc imported");
        const api = new WebIFC.IfcAPI();
        api.SetWasmPath("/wasm/", true);
        await api.Init();
        debug("web-ifc init done");
        if (cancelled) return;

        setMessage("Opening IFC model with web-ifc...");
        const modelID = api.OpenModel(bytes);
        debug("OpenModel done", { modelID });

        const projectCount = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT)?.size?.() ?? 0;
        const productCount = api.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCT)?.size?.() ?? 0;
        const shapeRepCount =
          api.GetLineIDsWithType(modelID, WebIFC.IFCSHAPEREPRESENTATION)?.size?.() ?? 0;

        let streamedMeshes = 0;
        let streamedGeometryRefs = 0;
        if (typeof api.StreamAllMeshes === "function") {
          try {
            api.StreamAllMeshes(modelID, (mesh: any) => {
              streamedMeshes += 1;
              const geometries = mesh?.geometries;
              if (Array.isArray(geometries)) streamedGeometryRefs += geometries.length;
              else if (geometries && typeof geometries.size === "number") streamedGeometryRefs += geometries.size;
              else if (geometries && typeof geometries.size === "function")
                streamedGeometryRefs += geometries.size();
            });
            debug("StreamAllMeshes done", { streamedMeshes, streamedGeometryRefs });
          } catch {
            // Keep diagnostics resilient if mesh streaming API signature changes.
            debug("StreamAllMeshes failed; signature may differ");
          }
        }

        api.CloseModel(modelID);
        debug("CloseModel done", {
          projectCount,
          productCount,
          shapeRepCount,
          streamedMeshes,
          streamedGeometryRefs,
        });

        if (cancelled) return;
        setStats({
          bytes: bytes.byteLength,
          projectCount,
          productCount,
          shapeRepCount,
          streamedMeshes,
          streamedGeometryRefs,
        });
        setMessage("Diagnostics complete.");
        debug("diagnostics complete", {
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      } catch (e) {
        if (cancelled) return;
        debug("diagnostics failed", e);
        setError(e instanceof Error ? e.message : String(e));
        setMessage("Diagnostics failed.");
      }
    };

    void run();
    return () => {
      cancelled = true;
      debug("diagnostics effect cleanup", {
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    };
  }, [ifcUrl, projectId, sourceMode]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">IFC Debug Sandbox</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Standalone Three.js render + direct web-ifc parsing diagnostics.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem]">
          <ProjectIdField value={projectId} showLabel={false} onChange={setProjectId} />
        </div>
        <div className="flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 p-1">
          <button
            type="button"
            onClick={() => setSourceMode("project")}
            className={
              sourceMode === "project"
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Project IFC
          </button>
          <button
            type="button"
            onClick={() => setSourceMode("test")}
            className={
              sourceMode === "test"
                ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-2 py-1 text-xs"
            }
          >
            Test IFC
          </button>
        </div>
      </div>

      <div
        ref={mountRef}
        className="h-[52vh] min-h-[20rem] w-full rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950"
      />

      <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
        <div className="text-zinc-600 dark:text-zinc-300">{message}</div>
        <div className="mt-1 text-zinc-500 dark:text-zinc-400">
          Source: <code className="font-mono">{ifcUrl}</code>
        </div>
        {stats ? (
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-zinc-700 dark:text-zinc-200">
            <div>
              bytes: <code className="font-mono">{stats.bytes}</code>
            </div>
            <div>
              IFCPROJECT: <code className="font-mono">{stats.projectCount}</code>
            </div>
            <div>
              IFCPRODUCT: <code className="font-mono">{stats.productCount}</code>
            </div>
            <div>
              IFCSHAPEREP: <code className="font-mono">{stats.shapeRepCount}</code>
            </div>
            <div>
              streamed meshes: <code className="font-mono">{stats.streamedMeshes}</code>
            </div>
            <div>
              streamed geom refs: <code className="font-mono">{stats.streamedGeometryRefs}</code>
            </div>
          </div>
        ) : null}
        {error ? <div className="mt-2 text-red-600 dark:text-red-300">{error}</div> : null}
      </div>
    </div>
  );
}
