"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BuildingIfcViewerStatusPayload } from "@/features/bim-viewer/components/BuildingIfcViewer";
import {
  AS_PLANNED_MANIFEST_API,
  type AsPlannedManifestClient,
} from "@/lib/as-planned-manifest-client";

const BuildingIfcViewer = dynamic(
  () => import("@/features/bim-viewer/components/BuildingIfcViewer").then((m) => m.default),
  { ssr: false, loading: () => <p className="p-4 text-sm text-zinc-500">Loading viewer…</p> }
);

function LabAsPlannedIfcInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BuildingIfcViewerStatusPayload | null>(null);
  const [manifest, setManifest] = useState<AsPlannedManifestClient | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(AS_PLANNED_MANIFEST_API);
        if (!res.ok) {
          throw new Error(`Manifest ${res.status}`);
        }
        const data = (await res.json()) as AsPlannedManifestClient;
        if (!cancelled) {
          setManifest(data);
          setManifestError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setManifest(null);
          setManifestError(e instanceof Error ? e.message : "Manifest failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshotParam = searchParams.get("snapshot")?.trim() ?? "";
  const expressParam = searchParams.get("expressId")?.trim() ?? "";
  const focusExpressId = useMemo(() => {
    const n = Number.parseInt(expressParam, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [expressParam]);

  const resolvedSnapshotId = useMemo(() => {
    if (!manifest) return snapshotParam || "week26";
    const valid = manifest.snapshots.some((s) => s.id === snapshotParam);
    if (valid) return snapshotParam;
    return manifest.defaultSnapshotId;
  }, [manifest, snapshotParam]);

  const currentSnap = useMemo(
    () => manifest?.snapshots.find((s) => s.id === resolvedSnapshotId),
    [manifest, resolvedSnapshotId]
  );

  useEffect(() => {
    if (!manifest) return;
    const valid = manifest.snapshots.some((s) => s.id === snapshotParam);
    if (valid && snapshotParam) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("snapshot", manifest.defaultSnapshotId);
    if (!expressParam) next.delete("expressId");
    else next.set("expressId", expressParam);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [manifest, snapshotParam, pathname, router, searchParams, expressParam]);

  const setSnapshot = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("snapshot", id);
      if (focusExpressId != null) next.set("expressId", String(focusExpressId));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, focusExpressId]
  );

  const ifcFetchUrl = `${AS_PLANNED_MANIFEST_API}?snapshot=${encodeURIComponent(resolvedSnapshotId)}`;
  const sourceTitle = currentSnap
    ? `${currentSnap.fileName}\nGET ${ifcFetchUrl}`
    : `${ifcFetchUrl}\n(loading manifest…)`;

  const statusChip =
    status?.status === "error"
      ? "border-red-400/40 bg-red-950/35 text-red-100"
      : status?.status === "ready"
        ? "border-emerald-400/35 bg-emerald-950/30 text-emerald-100"
        : "border-amber-400/35 bg-amber-950/30 text-amber-100";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-900">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-300">
          <span className="sr-only">Snapshot</span>
          <select
            className="max-w-[11rem] rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            value={resolvedSnapshotId}
            disabled={!manifest}
            onChange={(e) => setSnapshot(e.target.value)}
            aria-label="As-planned IFC snapshot"
          >
            {!manifest ? (
              <option value={resolvedSnapshotId}>…</option>
            ) : (
              manifest.snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))
            )}
          </select>
        </label>
        <p
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-700 dark:text-zinc-200"
          title={sourceTitle}
        >
          <span className="text-zinc-500 dark:text-zinc-400">Source</span> ·{" "}
          {currentSnap?.fileName ?? "—"}{" "}
          <span className="text-zinc-400 dark:text-zinc-500">({ifcFetchUrl})</span>
        </p>
        {focusExpressId != null ? (
          <span className="shrink-0 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
            expressId {focusExpressId}
          </span>
        ) : null}
        {manifestError ? (
          <span className="shrink-0 text-[10px] text-red-600 dark:text-red-400">{manifestError}</span>
        ) : null}
        <div
          className={`max-w-[min(100%,40vw)] shrink-0 truncate rounded border px-2 py-0.5 font-mono text-[10px] ${statusChip}`}
          title={status?.message}
        >
          {status?.message ?? "…"}
        </div>
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <BuildingIfcViewer
          key={`${resolvedSnapshotId}-${focusExpressId ?? "none"}`}
          projectId={`lab-as-planned-${resolvedSnapshotId}`}
          ifcSource="test"
          ifcFetchUrl={ifcFetchUrl}
          focusExpressId={focusExpressId}
          onStatusChange={setStatus}
          className="absolute inset-0 h-full w-full rounded-none border-0"
        />
      </div>
    </div>
  );
}

export default function LabAsPlannedIfcPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
          Loading…
        </div>
      }
    >
      <LabAsPlannedIfcInner />
    </Suspense>
  );
}
