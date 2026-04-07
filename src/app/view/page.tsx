"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BimIfcHousePreloader from "@/components/BimIfcHousePreloader";
import { useToast } from "@/components/ToastProvider";
import type { BuildingIfcViewerStatusPayload } from "@/features/bim-viewer/components/BuildingIfcViewer";
import {
  AS_PLANNED_MANIFEST_API,
  type AsPlannedManifestClient,
  type AsPlannedSnapshotClient,
} from "@/lib/as-planned-manifest-client";
import { PHASE1_LIBRARY_SAMPLES } from "@/lib/phase1-library-samples";

const BuildingIfcViewer = dynamic(
  () => import("@/features/bim-viewer/components/BuildingIfcViewer").then((m) => m.default),
  { ssr: false }
);

const SCHEPENDOM_PROJECT_ID = PHASE1_LIBRARY_SAMPLES.schependomlaan.suggestedProjectId;

/**
 * `?source=…` loads a file from `public/ifc/<name>.ifc` (served as `/ifc/...`).
 * Only listed keys are accepted (avoid arbitrary path fetches).
 */
const VIEW_IFC_SOURCE_PRESETS: Record<
  string,
  { ifcPath: string; viewerProjectId: string; listLabel: string; listSub: string }
> = {
  test: {
    ifcPath: "/ifc/test.ifc",
    viewerProjectId: "viewer-test",
    listLabel: "Test IFC",
    listSub: "/ifc/test.ifc",
  },
  /** Common typo / shorthand — same file as `test`. */
  testwhat: {
    ifcPath: "/ifc/test.ifc",
    viewerProjectId: "viewer-test",
    listLabel: "Test IFC",
    listSub: "/ifc/test.ifc (alias: source=testwhat)",
  },
};

function normalizeViewSourceParam(raw: string | null): string {
  return raw?.trim().toLowerCase() ?? "";
}

function resolveViewIfcPreset(sourceKey: string) {
  return sourceKey && VIEW_IFC_SOURCE_PRESETS[sourceKey]
    ? VIEW_IFC_SOURCE_PRESETS[sourceKey]
    : null;
}

function ViewTopBar(props: {
  children: ReactNode;
  /** When false, bar gets bottom border only (picker card below). */
  edgeToEdge?: boolean;
}) {
  return (
    <header
      className={`flex shrink-0 items-center justify-between gap-3 border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 ${
        props.edgeToEdge ? "border-b" : "border-b shadow-sm"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/view"
          className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          View model
        </Link>
        <Link
          href="/workflow?step=dashboard"
          className="shrink-0 text-sm font-medium text-violet-800 hover:underline dark:text-violet-200"
          title="Workflow step 3 — overview and traceability readiness (Back to setup to run pipeline)"
        >
          Dashboard
        </Link>
        <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
          bimimport
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
        {props.children}
      </div>
    </header>
  );
}

function modelListItemClass(active: boolean) {
  return [
    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
    active
      ? "border-violet-400 bg-violet-50 font-medium text-violet-950 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-50"
      : "border-transparent bg-transparent text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900",
  ].join(" ");
}

function ModelListSidebar(props: {
  /** Normalized `source` query value, e.g. `test`, `testwhat`, or "" */
  activeSourceKey: string;
  projectId: string;
  activeAsPlannedId: string | null;
  asPlannedSnapshots: AsPlannedSnapshotClient[] | null;
  asPlannedLoading: boolean;
  asPlannedError: string | null;
  onBusy: (label: string | null) => void;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const {
    activeSourceKey,
    projectId,
    activeAsPlannedId,
    asPlannedSnapshots,
    asPlannedLoading,
    asPlannedError,
    onBusy,
  } = props;

  const presetActive =
    activeSourceKey.length > 0 && resolveViewIfcPreset(activeSourceKey) != null;
  const schependomActive =
    activeAsPlannedId == null && !presetActive && projectId === SCHEPENDOM_PROJECT_ID;
  const otherProjectActive =
    activeAsPlannedId == null &&
    !presetActive &&
    projectId.length > 0 &&
    projectId !== SCHEPENDOM_PROJECT_ID;

  const runSchependomlaanDemo = useCallback(async () => {
    const meta = PHASE1_LIBRARY_SAMPLES.schependomlaan;
    onBusy(meta.label);
    try {
      const res = await fetch("/api/run-example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: meta.suggestedProjectId,
          sample: "schependomlaan",
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      router.replace(
        `/view?projectId=${encodeURIComponent(meta.suggestedProjectId)}`
      );
    } catch (e) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "Could not load Schependomlaan demo",
      });
    } finally {
      onBusy(null);
    }
  }, [onBusy, router, showToast]);

  const onUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      onBusy(`Uploading ${file.name}…`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse", { method: "POST", body: fd });
        if (!res.ok) {
          const t = await res.text();
          let msg = t || res.statusText;
          try {
            const j = JSON.parse(t) as { error?: string };
            if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
          } catch {
            /* keep plain text body */
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as {
          projectId?: string;
          summary?: { elementCount?: number };
        };
        if (!data.projectId?.trim()) throw new Error("No projectId returned from server.");
        const n = data.summary?.elementCount;
        showToast({
          type: "success",
          message:
            typeof n === "number" && Number.isFinite(n)
              ? `Model saved (${n} elements). Opening viewer…`
              : "Model saved. Opening viewer…",
        });
        router.replace(`/view?projectId=${encodeURIComponent(data.projectId.trim())}`);
      } catch (e) {
        showToast({
          type: "error",
          message: e instanceof Error ? e.message : "Upload failed",
        });
      } finally {
        onBusy(null);
      }
    },
    [onBusy, router, showToast]
  );

  return (
    <nav
      className="flex flex-col gap-1 p-2"
      aria-label="Choose IFC model"
    >
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Models
      </p>
      <ul className="flex flex-col gap-1">
        {(["test"] as const).map((key) => {
          const meta = VIEW_IFC_SOURCE_PRESETS[key];
          const activePreset =
            activeAsPlannedId == null &&
            (activeSourceKey === key || (key === "test" && activeSourceKey === "testwhat"));
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => router.replace(`/view?source=${encodeURIComponent(key)}`)}
                className={modelListItemClass(activePreset)}
              >
                <span className="block">{meta.listLabel}</span>
                <span className="mt-0.5 block font-mono text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                  {meta.listSub}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => void runSchependomlaanDemo()}
            className={modelListItemClass(schependomActive)}
          >
            <span className="block">Schependomlaan (large demo)</span>
            <span className="mt-0.5 block font-mono text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
              data/{PHASE1_LIBRARY_SAMPLES.schependomlaan.dataFile}
            </span>
          </button>
        </li>
        {otherProjectActive ? (
          <li>
            <div
              className={modelListItemClass(true)}
              title="From upload or another flow"
            >
              <span className="block">Current project</span>
              <span className="mt-0.5 block truncate font-mono text-[10px] font-normal text-zinc-600 dark:text-zinc-300">
                {projectId}
              </span>
            </div>
          </li>
        ) : null}
        <li className="pt-1">
          <label
            className={`flex cursor-pointer flex-col rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-left dark:border-zinc-600 dark:bg-zinc-900/50`}
          >
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              Upload IFC…
            </span>
            <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              Saves to <code className="font-mono">data/</code>
            </span>
            <input
              type="file"
              accept=".ifc,.IFC"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onUpload(f);
              }}
            />
          </label>
        </li>
      </ul>
      <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        As-planned (DataSetArch)
      </p>
      <ul className="flex flex-col gap-1">
        {asPlannedLoading ? (
          <li className="px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400">Loading…</li>
        ) : null}
        {asPlannedError ? (
          <li className="px-2 py-1 text-[10px] text-red-600 dark:text-red-400">{asPlannedError}</li>
        ) : null}
        {(asPlannedSnapshots ?? []).map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() =>
                router.replace(`/view?asPlanned=${encodeURIComponent(s.id)}`)
              }
              className={modelListItemClass(activeAsPlannedId === s.id)}
            >
              <span className="block">{s.label}</span>
              <span className="mt-0.5 block break-all font-mono text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                {s.fileName}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-zinc-200 px-2 pt-3 text-[10px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="text-violet-700 underline dark:text-violet-300">
          Phase 1
        </Link>
        <span aria-hidden className="mx-1">
          ·
        </span>
        <Link href="/bim" className="text-violet-700 underline dark:text-violet-300">
          BIM / passports
        </Link>
      </div>
    </nav>
  );
}

function ViewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId")?.trim() ?? "";
  const activeSourceKey = normalizeViewSourceParam(searchParams.get("source"));
  const sourcePreset = resolveViewIfcPreset(activeSourceKey);
  const rawSourceParam = searchParams.get("source")?.trim() ?? "";
  const asPlannedParam = searchParams.get("asPlanned")?.trim() ?? "";

  const [pickerBusy, setPickerBusy] = useState<string | null>(null);
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(
    null
  );
  const [uniformGhost, setUniformGhost] = useState(true);
  const [asPlannedManifest, setAsPlannedManifest] = useState<AsPlannedManifestClient | null>(
    null
  );
  const [asPlannedManifestError, setAsPlannedManifestError] = useState<string | null>(null);
  const [asPlannedManifestLoading, setAsPlannedManifestLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAsPlannedManifestLoading(true);
    void (async () => {
      try {
        const res = await fetch(AS_PLANNED_MANIFEST_API);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AsPlannedManifestClient;
        if (!cancelled) {
          setAsPlannedManifest(data);
          setAsPlannedManifestError(null);
        }
      } catch {
        if (!cancelled) {
          setAsPlannedManifest(null);
          setAsPlannedManifestError("Snapshot list failed");
        }
      } finally {
        if (!cancelled) setAsPlannedManifestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveAsPlannedId = useMemo(() => {
    if (!asPlannedParam) return "";
    if (!asPlannedManifest) return asPlannedParam;
    return asPlannedManifest.snapshots.some((s) => s.id === asPlannedParam)
      ? asPlannedParam
      : asPlannedManifest.defaultSnapshotId;
  }, [asPlannedParam, asPlannedManifest]);

  useEffect(() => {
    if (!asPlannedManifest || !asPlannedParam) return;
    const ok = asPlannedManifest.snapshots.some((s) => s.id === asPlannedParam);
    if (ok) return;
    router.replace(
      `/view?asPlanned=${encodeURIComponent(asPlannedManifest.defaultSnapshotId)}`,
      { scroll: false }
    );
  }, [asPlannedManifest, asPlannedParam, router]);

  const asPlannedMode = asPlannedParam.length > 0;
  const activeAsPlannedId = asPlannedMode ? effectiveAsPlannedId : null;
  const hasModel = sourcePreset != null || projectId.length > 0 || asPlannedMode;
  const unknownSourceOnly =
    rawSourceParam.length > 0 && sourcePreset == null && !asPlannedMode && projectId.length === 0;
  const viewerProjectId = asPlannedMode
    ? `view-asplanned-${effectiveAsPlannedId}`
    : sourcePreset
      ? sourcePreset.viewerProjectId
      : projectId;
  const ifcSource = asPlannedMode ? "test" : sourcePreset != null ? "test" : "project";
  const ifcFetchUrl = asPlannedMode
    ? `${AS_PLANNED_MANIFEST_API}?snapshot=${encodeURIComponent(effectiveAsPlannedId)}`
    : sourcePreset != null
      ? sourcePreset.ifcPath
      : undefined;

  const currentAsPlannedSnap = useMemo(
    () =>
      asPlannedManifest?.snapshots.find((s) => s.id === effectiveAsPlannedId) ??
      null,
    [asPlannedManifest, effectiveAsPlannedId]
  );

  useEffect(() => {
    setIfcStatus(null);
  }, [viewerProjectId, sourcePreset?.viewerProjectId, effectiveAsPlannedId, asPlannedMode]);

  const handleIfcStatusChange = useCallback(
    (payload: BuildingIfcViewerStatusPayload) => {
      setIfcStatus(payload);
    },
    []
  );

  const showPreloader =
    hasModel &&
    ifcStatus != null &&
    (ifcStatus.status === "idle" || ifcStatus.status === "loading");

  const statusChip =
    ifcStatus?.status === "error"
      ? "border-red-400/40 bg-red-950/35 text-red-100"
      : ifcStatus?.status === "ready"
        ? "border-emerald-400/35 bg-emerald-950/30 text-emerald-100"
        : "border-amber-400/35 bg-amber-950/30 text-amber-100";

  const advancedHref = asPlannedMode
    ? `/lab/as-planned-ifc?snapshot=${encodeURIComponent(effectiveAsPlannedId)}`
    : ifcSource === "test"
      ? "/bim?view=building"
      : `/bim?projectId=${encodeURIComponent(viewerProjectId)}&view=building`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <ViewTopBar edgeToEdge>
        <Link
          href="/"
          className="text-xs font-medium text-violet-700 underline dark:text-violet-300"
        >
          All tools
        </Link>
      </ViewTopBar>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex max-h-[40vh] shrink-0 flex-col overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:max-h-none md:w-56 md:border-b-0 md:border-r">
          {pickerBusy ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <BimIfcHousePreloader variant="inline" message={pickerBusy} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <ModelListSidebar
                activeSourceKey={activeSourceKey}
                projectId={projectId}
                activeAsPlannedId={activeAsPlannedId}
                asPlannedSnapshots={asPlannedManifest?.snapshots ?? null}
                asPlannedLoading={asPlannedManifestLoading}
                asPlannedError={asPlannedManifestError}
                onBusy={setPickerBusy}
              />
            </div>
          )}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {hasModel ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                {asPlannedMode && currentAsPlannedSnap ? (
                  <p
                    className="max-w-[min(100%,70vw)] truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-300"
                    title={`${currentAsPlannedSnap.fileName}\n${ifcFetchUrl ?? ""}`}
                  >
                    <span className="text-zinc-400 dark:text-zinc-500">Source</span> ·{" "}
                    {currentAsPlannedSnap.fileName}
                  </p>
                ) : null}
                <div
                  className={`max-w-[min(100%,min(90vw,28rem))] truncate rounded border px-2 py-1 font-mono text-[10px] ${statusChip}`}
                  title={ifcStatus?.message}
                >
                  {ifcStatus?.message ?? "…"}
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-600 dark:bg-zinc-900"
                  title="Ghost dims the model for clearer shape readout; Solid shows full IFC materials."
                >
                  <button
                    type="button"
                    onClick={() => setUniformGhost(true)}
                    className={
                      uniformGhost
                        ? "rounded px-2 py-1 text-[10px] font-medium bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                        : "rounded px-2 py-1 text-[10px] text-zinc-600 dark:text-zinc-400"
                    }
                  >
                    Ghost
                  </button>
                  <button
                    type="button"
                    onClick={() => setUniformGhost(false)}
                    className={
                      !uniformGhost
                        ? "rounded px-2 py-1 text-[10px] font-medium bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                        : "rounded px-2 py-1 text-[10px] text-zinc-600 dark:text-zinc-400"
                    }
                  >
                    Solid
                  </button>
                </div>
                <Link
                  href={advancedHref}
                  className="ml-auto shrink-0 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100"
                >
                  {asPlannedMode ? "Lab snapshot" : "Advanced BIM"}
                </Link>
              </div>
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <Suspense
                  fallback={
                    <BimIfcHousePreloader variant="overlay" message="Loading 3D viewer…" />
                  }
                >
                  <BuildingIfcViewer
                    key={`${ifcSource}-${viewerProjectId}-${ifcFetchUrl ?? "default"}`}
                    projectId={viewerProjectId}
                    ifcSource={ifcSource}
                    ifcFetchUrl={ifcFetchUrl}
                    focusExpressId={null}
                    uniformGhost={uniformGhost}
                    onStatusChange={handleIfcStatusChange}
                    className="absolute inset-0 z-0 min-h-0 min-w-0"
                  />
                </Suspense>
                {showPreloader ? (
                  <BimIfcHousePreloader
                    variant="overlay"
                    message={
                      ifcStatus?.status === "loading" && ifcStatus.message
                        ? ifcStatus.message
                        : "Preparing the model…"
                    }
                  />
                ) : null}
                {ifcStatus?.status === "error" ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-red-950/85 px-3 py-2 text-center text-xs text-red-50">
                    <p className="font-medium">Could not load model</p>
                    <p className="mt-0.5 font-mono text-[10px] opacity-90">
                      {ifcStatus.message}
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              {unknownSourceOnly ? (
                <p className="max-w-md text-sm text-amber-800 dark:text-amber-200">
                  Unknown <code className="font-mono text-xs">source={rawSourceParam}</code>. Use{" "}
                  <code className="font-mono text-xs">test</code> or{" "}
                  <code className="font-mono text-xs">testwhat</code> (same file), or{" "}
                  <code className="font-mono text-xs">projectId=…</code> / upload. To add another
                  preset, put <code className="font-mono text-xs">*.ifc</code> under{" "}
                  <code className="font-mono text-xs">public/ifc/</code> and register it in{" "}
                  <code className="font-mono text-xs">VIEW_IFC_SOURCE_PRESETS</code>.
                </p>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Choose a model in the list
                  <span className="hidden md:inline"> on the left</span>
                  <span className="md:hidden"> above</span>
                  .
                </p>
              )}
              <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                Switching models updates the canvas here — no full page reload.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-950">
          <BimIfcHousePreloader variant="inline" message="Loading view…" />
        </div>
      }
    >
      <ViewPageInner />
    </Suspense>
  );
}
