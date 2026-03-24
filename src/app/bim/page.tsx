"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProjectIdField from "@/components/ProjectIdField";
import BuildingIfcViewer from "@/features/bim-viewer/components/BuildingIfcViewer";
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
  const { projectId, setProjectId } = useProjectId();
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

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setKbMissing(false);
      setSelectedExpressId(null);

      try {
        const data = await loadPhase4Passports(projectId);
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
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [projectId, showToast]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Phase 4 - Visualize
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Three.js model view with element selection and passport inspection.
          </p>
        </div>
        <div className="min-w-[16rem]">
          <ProjectIdField value={projectId} onChange={setProjectId} />
        </div>
      </div>

      <div className="text-xs text-zinc-600 dark:text-zinc-300">
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
          <div className="ml-2 flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 p-1">
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

      {error ? (
        <div
          className={
            kbMissing
              ? "rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300"
              : "rounded border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300"
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

      {viewMode === "building" ? (
        <BuildingIfcViewer projectId={projectId} ifcSource={ifcSource} />
      ) : (
        <PassportModelView
          loading={loading}
          kbMissing={kbMissing}
          selectedExpressId={selectedExpressId}
          onSelectExpressId={setSelectedExpressId}
          passportByExpressId={passportByExpressId}
          passportsOrdered={passportsOrdered}
        />
      )}
    </div>
  );
}
