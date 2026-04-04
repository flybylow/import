"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ViewerItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  heightHint?: number;
};

type Props = {
  items: ViewerItem[];
  selectedExpressId: number | null;
  onSelectExpressId: (id: number) => void;
  onViewerState?: (s: { ready: boolean; error: string | null }) => void;
  className?: string;
};

/** MVP: dim the whole abstract city first; selection is drawn opaque after (KISS). */
const ABSTRACT_GHOST_OPACITY = 0.14;

function hashToUnitInterval(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function BimViewer3D(props: Props) {
  const classNameProp = props.className ?? "";
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshByExpressIdRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const selectedPrevRef = useRef<number | null>(null);
  const onSelectExpressIdRef = useRef(props.onSelectExpressId);
  const onViewerStateRef = useRef(props.onViewerState);

  const prepared = useMemo(() => props.items.slice(0, 600), [props.items]);

  useEffect(() => {
    onSelectExpressIdRef.current = props.onSelectExpressId;
    onViewerStateRef.current = props.onViewerState;
  }, [props.onSelectExpressId, props.onViewerState]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    onViewerStateRef.current?.({ ready: false, error: null });

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    camera.position.set(20, 20, 24);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1);
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    // three.js manual / responsive: CSS controls display size; setSize(..., false) sets drawing buffer only.
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.verticalAlign = "top";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(15, 20, 10);
    scene.add(dir);
    const grid = new THREE.GridHelper(120, 120, 0x888888, 0xd4d4d8);
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshByExpressId = meshByExpressIdRef.current;
    meshByExpressId.clear();

    // MVP abstraction: one box per element to keep interaction fast and deterministic.
    prepared.forEach((item, idx) => {
      const col = idx % 24;
      const row = Math.floor(idx / 24);
      const baseX = (col - 12) * 1.35;
      const baseZ = (row - 12) * 1.35;
      const h = Math.max(0.4, Math.min(item.heightHint ?? 2, 8));

      const geo = new THREE.BoxGeometry(1.1, h, 1.1);
      const hue = hashToUnitInterval(item.expressId) * 0.2 + 0.52;
      const color = new THREE.Color().setHSL(hue, 0.6, 0.58);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        transparent: true,
        opacity: ABSTRACT_GHOST_OPACITY,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(baseX, h / 2, baseZ);
      mesh.userData.expressId = item.expressId;
      mesh.userData.baseColor = color.clone();
      scene.add(mesh);
      meshByExpressId.set(item.expressId, mesh);
    });

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
      ro = new ResizeObserver(() => {
        fitCanvasToMount();
      });
      ro.observe(mount);
    } catch {
      // ResizeObserver unavailable (very old browsers)
    }

    const onWinResize = () => fitCanvasToMount();
    window.addEventListener("resize", onWinResize);

    // First paint often runs before flex/grid has assigned height; window "resize" may not fire.
    let bootRaf2 = 0;
    const bootRaf1 = requestAnimationFrame(() => {
      fitCanvasToMount();
      bootRaf2 = requestAnimationFrame(fitCanvasToMount);
    });

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(Array.from(meshByExpressId.values()));
      if (!intersects.length) return;
      const expressId = Number(intersects[0].object.userData.expressId);
      if (Number.isFinite(expressId)) onSelectExpressIdRef.current(expressId);
    };
    renderer.domElement.addEventListener("click", onClick);

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();
    onViewerStateRef.current?.({ ready: true, error: null });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(bootRaf1);
      cancelAnimationFrame(bootRaf2);
      ro?.disconnect();
      window.removeEventListener("resize", onWinResize);
      renderer.domElement.removeEventListener("click", onClick);
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
      meshByExpressId.clear();
    };
    // Only rebuild the WebGL scene when `items` data changes — not on every parent render
    // (depending on `props` caused a full teardown/reinit whenever any prop reference changed).
  }, [prepared]);

  useEffect(() => {
    const meshByExpressId = meshByExpressIdRef.current;
    const next = props.selectedExpressId;
    const prev = selectedPrevRef.current;

    if (prev != null) {
      const prevMesh = meshByExpressId.get(prev);
      if (prevMesh) {
        const mat = prevMesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(prevMesh.userData.baseColor as THREE.Color);
        mat.emissive.set(0x000000);
        mat.transparent = true;
        mat.opacity = ABSTRACT_GHOST_OPACITY;
        mat.depthWrite = false;
      }
    }

    if (next != null) {
      const mesh = meshByExpressId.get(next);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(0x8b5cf6);
        mat.emissive.set(0x2e1065);
        mat.transparent = true;
        mat.opacity = 1;
        mat.depthWrite = true;

        const applyFocus = () => {
          const controls = controlsRef.current;
          const camera = cameraRef.current;
          if (!controls || !camera) return;
          const target = mesh.position.clone();
          const size = new THREE.Vector3();
          mesh.geometry.computeBoundingBox();
          mesh.geometry.boundingBox?.getSize(size);
          const pad = Math.max(size.x, size.y, size.z, 1.2) * 2.2;
          controls.target.copy(target);
          camera.position.set(target.x + pad, target.y + pad * 0.75, target.z + pad);
          controls.update();
        };

        // After scene init or resize, OrbitControls/camera may need a frame before target updates stick.
        requestAnimationFrame(() => {
          requestAnimationFrame(applyFocus);
        });
      }
    }

    selectedPrevRef.current = next;
  }, [props.selectedExpressId, prepared]);

  return (
    <div
      className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded border border-zinc-200 dark:border-zinc-800 bg-transparent ${classNameProp}`.trim()}
    >
      {/* Inline minHeight so parent Tailwind min-h-0 cannot collapse the WebGL mount to 0px. */}
      <div
        ref={mountRef}
        className="relative min-h-0 w-full flex-1"
        style={{ minHeight: "min(45dvh, 22rem)" }}
      />
    </div>
  );
}
