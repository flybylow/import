"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BuildingIfcViewer, {
  type BuildingIfcViewerStatusPayload,
} from "@/features/bim-viewer/components/BuildingIfcViewer";
import PassportModelView from "@/features/bim-viewer/components/PassportModelView";
import { useToast } from "@/components/ToastProvider";
import {
  loadPhase4Passports,
  Phase4PassportLoadError,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import { useProjectId } from "@/lib/useProjectId";

export default function BimFacePage() {
  const { showToast } = useToast();
  const { projectId } = useProjectId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"building" | "passports">("building");
  const [ifcSource, setIfcSource] = useState<"project" | "test">("project");
  const [selectedExpressId, setSelectedExpressId] = useState<number | null>(null);
  const [passportByExpressId, setPassportByExpressId] = useState<
    Record<number, Phase4ElementPassport>
  >({});
  const [passportsOrdered, setPassportsOrdered] = useState<Phase4ElementPassport[]>([]);
  const [passportTotal, setPassportTotal] = useState(0);
  const [kbMissing, setKbMissing] = useState(false);
  const [passportPhase, setPassportPhase] = useState<string | null>(null);
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(null);

  const handleIfcStatusChange = useCallback((payload: BuildingIfcViewerStatusPayload) => {
    setIfcStatus(payload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setPassportPhase("Starting…");
      setError(null);
      setKbMissing(false);
      setSelectedExpressId(null);

      try {
        const data = await loadPhase4Passports(projectId, (label) => {
          if (!cancelled) setPassportPhase(label);
        });
        if (cancelled) return;
        setPassportByExpressId(data.byExpressId);
        setPassportsOrdered(data.ordered);
        setPassportTotal(data.total);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const isMissing = e instanceof Phase4PassportLoadError && e.code === "KB_MISSING";
        setKbMissing(isMissing);
        setError(msg);
        showToast({
          type: isMissing ? "info" : "error",
          message: msg,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPassportPhase(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [projectId, showToast]);

  const ifcToolbarClass =
    ifcStatus?.status === "error"
      ? "rounded border border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-xs text-red-800 dark:text-red-200"
      : ifcStatus?.status === "ready"
        ? "rounded border border-emerald-300/80 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25 px-2 py-1 text-xs text-emerald-900 dark:text-emerald-100"
        : "rounded border border-amber-300/80 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 px-2 py-1 text-xs text-amber-950 dark:text-amber-100";

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 px-6 pt-3 pb-3">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("building")}
            className={
              viewMode === "building"
                ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
            }
          >
            Building
          </button>
          <button
            type="button"
            onClick={() => setViewMode("passports")}
            className={
              viewMode === "passports"
                ? "rounded px-3 py-1.5 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700"
            }
          >
            Passports
          </button>
          {viewMode === "building" ? (
            <div className="ml-1 flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 p-1">
              <button
                type="button"
                onClick={() => setIfcSource("project")}
                className={
                  ifcSource === "project"
                    ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "rounded px-2 py-1 text-xs"
                }
              >
                Project IFC
              </button>
              <button
                type="button"
                onClick={() => setIfcSource("test")}
                className={
                  ifcSource === "test"
                    ? "rounded px-2 py-1 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "rounded px-2 py-1 text-xs"
                }
              >
                Test IFC
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === "passports" ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 shrink-0">
            Passports loaded:{" "}
            <code className="font-mono">{passportsOrdered.length}</code> of{" "}
            <code className="font-mono">{passportTotal}</code>
            {selectedExpressId != null ? (
              <>
                {" "}
                · selected <code className="font-mono">{selectedExpressId}</code>
              </>
            ) : null}
          </div>
        ) : null}

        {loading && passportPhase && viewMode === "passports" ? (
          <div className="flex flex-wrap items-center gap-2 rounded border border-amber-300/80 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-2 py-1 text-xs text-amber-950 dark:text-amber-100">
            <span
              className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500"
              aria-hidden
            />
            <span className="font-mono">{passportPhase}</span>
          </div>
        ) : null}

        {viewMode === "building" && ifcStatus && ifcStatus.status !== "idle" ? (
          <div className={`min-w-0 max-w-full flex-1 basis-[min(100%,28rem)] ${ifcToolbarClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              {ifcStatus.status === "loading" ? (
                <span
                  className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0 font-mono leading-snug">{ifcStatus.message}</span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          className={
            kbMissing
              ? "shrink-0 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300"
              : "shrink-0 rounded border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300"
          }
        >
          <p>{error}</p>
          {kbMissing ? (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <Link
                href={`/kb?projectId=${encodeURIComponent(projectId)}`}
                className="underline font-medium"
              >
                Go to Phase 2 - Link materials
              </Link>
              <Link href="/" className="underline">
                Back to Phase 1
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {viewMode === "building" ? (
          <BuildingIfcViewer
            projectId={projectId}
            ifcSource={ifcSource}
            onStatusChange={handleIfcStatusChange}
            className="min-h-0 flex-1"
          />
        ) : (
          <PassportModelView
            loading={loading}
            kbMissing={kbMissing}
            selectedExpressId={selectedExpressId}
            onSelectExpressId={setSelectedExpressId}
            passportByExpressId={passportByExpressId}
            passportsOrdered={passportsOrdered}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </div>
  );
}
