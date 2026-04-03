"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Khronos glTF sample (CC-licensed); used only to verify GLTF + WebGL in-app. */
export const KHRONOS_DUCK_GLTF_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb";

type Props = {
  className?: string;
};

export default function GltfDuckViewer(props: Props) {
  const { className = "" } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setStatus("loading");
    setErrorDetail(null);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe4e4e7);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500);
    camera.position.set(2, 1.6, 2.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ("outputColorSpace" in renderer) {
      (renderer as THREE.WebGLRenderer).outputColorSpace =
        THREE.SRGBColorSpace;
    }
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.verticalAlign = "top";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(4, 10, 6);
    scene.add(dir);

    const grid = new THREE.GridHelper(8, 16, 0x9ca3af, 0xd4d4d8);
    grid.position.y = -0.001;
    scene.add(grid);

    const fitCanvasToMount = () => {
      const displayW = Math.max(1, Math.floor(mount.clientWidth));
      const displayH = Math.max(1, Math.floor(mount.clientHeight));
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      const bufW = Math.floor(displayW * pr);
      const bufH = Math.floor(displayH * pr);
      if (canvas.width !== bufW || canvas.height !== bufH) {
        renderer.setSize(bufW, bufH, false);
      }
      camera.aspect = displayW / displayH;
      camera.updateProjectionMatrix();
    };

    fitCanvasToMount();

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => fitCanvasToMount());
      ro.observe(mount);
    } catch {
      /* ignore */
    }

    const onWinResize = () => fitCanvasToMount();
    window.addEventListener("resize", onWinResize);

    let bootRaf2 = 0;
    const bootRaf1 = requestAnimationFrame(() => {
      fitCanvasToMount();
      bootRaf2 = requestAnimationFrame(fitCanvasToMount);
    });

    const loader = new GLTFLoader();
    let root: THREE.Object3D | null = null;
    let cancelled = false;

    loader.load(
      KHRONOS_DUCK_GLTF_URL,
      (gltf) => {
        if (cancelled) return;
        root = gltf.scene;
        scene.add(root);

        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        controls.target.copy(center);
        const dist = maxDim * 1.8;
        camera.position.set(center.x + dist * 0.7, center.y + dist * 0.45, center.z + dist * 0.85);
        controls.update();

        fitCanvasToMount();
        setStatus("ready");
      },
      undefined,
      (err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErrorDetail(msg);
        setStatus("error");
      }
    );

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(bootRaf1);
      cancelAnimationFrame(bootRaf2);
      ro?.disconnect();
      window.removeEventListener("resize", onWinResize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      mount.innerHTML = "";
    };
  }, []);

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 ${className}`.trim()}
    >
      <div
        ref={mountRef}
        className="relative min-h-0 w-full flex-1"
        style={{ minHeight: "min(50dvh, 28rem)" }}
      />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-100/90 text-xs text-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-200">
          <span
            className="inline-block h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-600 dark:border-zinc-600 dark:border-t-violet-400"
            aria-hidden
          />
          <span className="font-medium">Loading GLTF sample…</span>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-red-50/95 p-4 text-center text-sm text-red-900 dark:bg-red-950/90 dark:text-red-100">
          <p className="font-medium">Could not load the duck GLTF.</p>
          <p className="max-w-md text-xs opacity-90">{errorDetail}</p>
          <p className="max-w-md text-[11px] text-red-800/90 dark:text-red-200/90">
            Check network / CORS, or open the devtools console.
          </p>
        </div>
      ) : null}
    </div>
  );
}
