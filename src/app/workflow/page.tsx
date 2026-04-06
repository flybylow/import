"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import ProjectIdField from "@/components/ProjectIdField";
import { useToast } from "@/components/ToastProvider";
import { buildFullCalculateSelectionFromKbStatus } from "@/lib/build-full-calculate-selection";
import {
  PHASE1_LIBRARY_SAMPLES,
  PHASE1_LIBRARY_SAMPLE_KEYS,
  type Phase1LibrarySampleKey,
} from "@/lib/phase1-library-samples";
import { useProjectId } from "@/lib/useProjectId";
import { bimPassportsElementHref } from "@/lib/passport-navigation-links";
import {
  passportTypeGroupKeyFromRow,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import {
  WORKFLOW_PIPELINE_PHASE_ESTIMATED_MS,
  WORKFLOW_PIPELINE_PHASE_WEIGHT,
  type WorkflowPipelinePhase,
} from "@/lib/workflow-pipeline-progress";

function bimBuildingViewerHref(projectId: string) {
  const q = new URLSearchParams();
  q.set("projectId", projectId);
  q.set("view", "building");
  q.set("from", "workflow");
  q.set("ghost", "0");
  return `/bim?${q.toString()}`;
}

function bimPassportsHref(projectId: string) {
  const q = new URLSearchParams();
  q.set("projectId", projectId);
  q.set("view", "passports");
  q.set("from", "workflow");
  return `/bim?${q.toString()}`;
}

function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fileBasename(relativePath: string): string {
  const seg = relativePath.replace(/\\/g, "/").split("/").pop()?.trim();
  return seg && seg.length > 0 ? seg : relativePath;
}

/** Keep the start of the basename; ellipsis at the end (long UUID-prefixed names). */
function truncateBasenameFromStart(name: string, maxChars = 32): string {
  if (name.length <= maxChars) return name;
  const ellipsis = "…";
  const take = maxChars - ellipsis.length;
  if (take < 4) return `${name.slice(0, maxChars - 1)}${ellipsis}`;
  return `${name.slice(0, take)}${ellipsis}`;
}

type WizardStep = "model" | "run" | "dashboard";

type PipelineTraceJson = {
  projectId: string;
  generatedAt: string;
  phases: Array<{
    id: string;
    title: string;
    description: string;
    files: Array<{
      label: string;
      relativePath: string;
      exists: boolean;
      byteSize?: number;
      mtimeIso?: string;
    }>;
  }>;
};

/** Matches `GET /api/pipeline/trace` phase ids — not produced by Dynamic run (`/workflow`). */
const OPTIONAL_TRACE_PHASE_IDS = new Set<string>(["phase2-translate"]);

function maxMtimeFromTrace(trace: PipelineTraceJson | null): string | null {
  if (!trace?.phases) return null;
  let max = 0;
  for (const ph of trace.phases) {
    for (const f of ph.files) {
      if (!f.exists || !f.mtimeIso) continue;
      const t = Date.parse(f.mtimeIso);
      if (Number.isFinite(t) && t > max) max = t;
    }
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

function StepIndicator(props: {
  current: WizardStep;
}) {
  const order: WizardStep[] = ["model", "run", "dashboard"];
  const labels: Record<WizardStep, string> = {
    model: "1 · Setup",
    run: "2 · Run",
    dashboard: "3 · Dashboard",
  };
  const idx = order.indexOf(props.current);
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {order.map((k, i) => (
        <li key={k} className="inline-flex items-center gap-2">
          <span
            className={
              i <= idx
                ? "rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900 dark:border-violet-600 dark:bg-violet-950/50 dark:text-violet-100"
                : "rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500"
            }
          >
            {labels[k]}
          </span>
          {i < order.length - 1 ? (
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function WorkflowPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { projectId, setProjectId } = useProjectId();

  const [step, setStep] = useState<WizardStep>("model");
  const [pipelineDetailsOpen, setPipelineDetailsOpen] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [librarySample, setLibrarySample] =
    useState<Phase1LibrarySampleKey>("schependomlaan");

  const [runLabel, setRunLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [pipelineProgressPct, setPipelineProgressPct] = useState(0);
  const pipelineCompletedFracRef = useRef(0);
  const pipelineRafRef = useRef(0);

  const [dashboardTrace, setDashboardTrace] = useState<PipelineTraceJson | null>(null);
  const [dashboardKb, setDashboardKb] = useState<{
    elementCount: number;
    passportPreviewTotal: number;
    passports: Array<{
      elementName?: string;
      expressId?: number;
      ifcType?: string;
      /** Same as Passports finder `?group=` (e.g. `IfcBeam`, `IfcCovering · CEILING`). */
      groupKey: string;
    }>;
  } | null>(null);
  const [dashboardKbError, setDashboardKbError] = useState<string | null>(null);
  const [dashboardFetchedAt, setDashboardFetchedAt] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardTraceError, setDashboardTraceError] = useState<string | null>(null);
  const [lastCalcGwp, setLastCalcGwp] = useState<string | null>(null);
  const [calcSkipped, setCalcSkipped] = useState(false);

  const cancelPipelineProgressAnim = useCallback(() => {
    if (pipelineRafRef.current) cancelAnimationFrame(pipelineRafRef.current);
    pipelineRafRef.current = 0;
  }, []);

  const beginPipelinePhaseVisual = useCallback(
    (phase: WorkflowPipelinePhase) => {
      cancelPipelineProgressAnim();
      const base = pipelineCompletedFracRef.current;
      const w = WORKFLOW_PIPELINE_PHASE_WEIGHT[phase];
      const dur = Math.max(2000, WORKFLOW_PIPELINE_PHASE_ESTIMATED_MS[phase]);
      const t0 = performance.now();
      const tick = () => {
        const u = Math.min(1, (performance.now() - t0) / dur);
        const frac = base + w * (0.05 + 0.88 * u);
        setPipelineProgressPct(Math.min(99, Math.round(frac * 1000) / 10));
        if (u < 1) pipelineRafRef.current = requestAnimationFrame(tick);
      };
      pipelineRafRef.current = requestAnimationFrame(tick);
    },
    [cancelPipelineProgressAnim]
  );

  const endPipelinePhaseVisual = useCallback(
    (phase: WorkflowPipelinePhase) => {
      cancelPipelineProgressAnim();
      pipelineCompletedFracRef.current += WORKFLOW_PIPELINE_PHASE_WEIGHT[phase];
      setPipelineProgressPct(Math.round(pipelineCompletedFracRef.current * 1000) / 10);
    },
    [cancelPipelineProgressAnim]
  );
  useEffect(() => {
    const pid = projectId.trim();
    const match = PHASE1_LIBRARY_SAMPLE_KEYS.find(
      (k) => PHASE1_LIBRARY_SAMPLES[k].suggestedProjectId === pid
    );
    if (match) setLibrarySample(match);
  }, [projectId]);

  const syncProjectToUrl = useCallback(() => {
    const pid = projectId.trim() || "example";
    const q = new URLSearchParams(searchParams.toString());
    q.set("projectId", pid);
    router.replace(`/workflow?${q.toString()}`, { scroll: false });
  }, [projectId, router, searchParams]);

  const syncWorkflowUrl = useCallback(
    (nextStep: WizardStep) => {
      const pid = projectId.trim() || "example";
      const q = new URLSearchParams(searchParams.toString());
      q.set("projectId", pid);
      if (nextStep === "dashboard") q.set("step", "dashboard");
      else q.delete("step");
      router.replace(`/workflow?${q.toString()}`, { scroll: false });
    },
    [projectId, router, searchParams]
  );

  const resetDashboardSnapshot = useCallback(() => {
    setDashboardTrace(null);
    setDashboardKb(null);
    setDashboardKbError(null);
    setDashboardTraceError(null);
    setDashboardFetchedAt(null);
    setLastCalcGwp(null);
    setCalcSkipped(false);
  }, []);

  const loadDashboard = useCallback(async (pid: string) => {
    setDashboardLoading(true);
    setDashboardKbError(null);
    setDashboardTraceError(null);
    try {
      const tr = await fetch(
        `/api/pipeline/trace?projectId=${encodeURIComponent(pid)}`
      );
      if (!tr.ok) {
        setDashboardTrace(null);
        setDashboardTraceError((await tr.text()) || tr.statusText || "Trace request failed");
      } else {
        setDashboardTrace((await tr.json()) as PipelineTraceJson);
      }

      const kbRes = await fetch(
        `/api/kb/status?projectId=${encodeURIComponent(pid)}` +
          `&includeElementPassports=true&elementPassportsLimit=50&elementPassportsUniqueName=true`
      );
      if (kbRes.ok) {
        const j = (await kbRes.json()) as {
          elementCount?: number;
          elementPassportTotal?: number;
          elementPassports?: Phase4ElementPassport[];
        };
        setDashboardKb({
          elementCount: typeof j.elementCount === "number" ? j.elementCount : 0,
          passportPreviewTotal:
            typeof j.elementPassportTotal === "number" ? j.elementPassportTotal : 0,
          passports: Array.isArray(j.elementPassports)
            ? j.elementPassports.map((row) => ({
                elementName: row.elementName,
                expressId: row.expressId,
                ifcType: row.ifcType,
                groupKey: passportTypeGroupKeyFromRow(row),
              }))
            : [],
        });
      } else {
        setDashboardKb(null);
        const t = await kbRes.text().catch(() => "");
        setDashboardKbError(t || kbRes.statusText || "KB status unavailable");
      }
    } catch (e) {
      setDashboardTrace(null);
      setDashboardKb(null);
      const msg = e instanceof Error ? e.message : String(e);
      setDashboardTraceError(msg);
      setDashboardKbError(msg);
    } finally {
      setDashboardFetchedAt(new Date().toISOString());
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("step") === "dashboard") {
      setStep("dashboard");
    }
  }, [searchParams]);

  useEffect(() => {
    if (step !== "dashboard") return;
    const pid = projectId.trim() || "example";
    void loadDashboard(pid);
  }, [step, projectId, loadDashboard]);

  const runFullPipeline = useCallback(async () => {
    setRunError(null);
    resetDashboardSnapshot();
    setStep("run");
    syncWorkflowUrl("run");
    setPipelineDetailsOpen(true);
    setRunning(true);
    cancelPipelineProgressAnim();
    pipelineCompletedFracRef.current = 0;
    setPipelineProgressPct(0);
    const pid = projectId.trim() || "example";

    const fail = (msg: string) => {
      cancelPipelineProgressAnim();
      setRunError(msg);
      setRunning(false);
      showToast({ type: "error", message: msg });
    };

    try {
      setRunLabel("Importing IFC → triples…");
      beginPipelinePhaseVisual("importTriples");
      const re = await fetch("/api/run-example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, sample: librarySample }),
      });
      if (!re.ok) {
        fail((await re.text()) || re.statusText);
        return;
      }
      endPipelinePhaseVisual("importTriples");

      setRunLabel("Enriching graph (quantities & materials)…");
      beginPipelinePhaseVisual("enrichGraph");
      const en = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      if (!en.ok) {
        fail((await en.text()) || en.statusText);
        return;
      }
      endPipelinePhaseVisual("enrichGraph");

      setRunLabel("Building knowledge base (EPD links)…");
      beginPipelinePhaseVisual("buildKb");
      const kb = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid }),
      });
      if (!kb.ok) {
        const t = await kb.text();
        fail(t || kb.statusText);
        return;
      }
      endPipelinePhaseVisual("buildKb");

      setRunLabel("Loading KB status for calculation…");
      beginPipelinePhaseVisual("kbStatus");
      const stRes = await fetch(
        `/api/kb/status?projectId=${encodeURIComponent(pid)}` +
          `&includeElementPassports=false&elementPassportsLimit=0`
      );
      if (!stRes.ok) {
        fail((await stRes.text()) || stRes.statusText);
        return;
      }
      endPipelinePhaseVisual("kbStatus");
      const statusJson = (await stRes.json()) as Parameters<
        typeof buildFullCalculateSelectionFromKbStatus
      >[0];

      const selection = buildFullCalculateSelectionFromKbStatus(statusJson);
      if (selection.length === 0) {
        cancelPipelineProgressAnim();
        pipelineCompletedFracRef.current += WORKFLOW_PIPELINE_PHASE_WEIGHT.calculate;
        setPipelineProgressPct(100);
        setRunning(false);
        setCalcSkipped(true);
        setLastCalcGwp(null);
        showToast({
          type: "error",
          message:
            "Nothing to calculate (quantities / LCA-ready EPD). Open Calculate or KB to fix matching — dashboard lists what is on disk.",
        });
        setStep("dashboard");
        syncWorkflowUrl("dashboard");
        return;
      }

      setRunLabel(`Calculating carbon (${selection.length} materials)…`);
      beginPipelinePhaseVisual("calculate");
      const calc = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, selection }),
      });
      const calcJson = (await calc.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!calc.ok) {
        const msg =
          (calcJson?.error as string) ||
          (await calc.text()) ||
          calc.statusText;
        fail(msg);
        return;
      }
      endPipelinePhaseVisual("calculate");
      cancelPipelineProgressAnim();
      setPipelineProgressPct(100);

      setRunning(false);
      const total =
        calcJson && typeof calcJson.totalKgCO2e === "number"
          ? calcJson.totalKgCO2e.toFixed(4)
          : "done";
      setCalcSkipped(false);
      setLastCalcGwp(typeof total === "string" && total !== "done" ? total : null);
      showToast({
        type: "success",
        message: `Pipeline finished (GWP ≈ ${total} kg CO₂e). Dashboard shows artifacts and package elements.`,
      });
      setStep("dashboard");
      syncWorkflowUrl("dashboard");
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [
    beginPipelinePhaseVisual,
    cancelPipelineProgressAnim,
    endPipelinePhaseVisual,
    librarySample,
    projectId,
    resetDashboardSnapshot,
    showToast,
    syncWorkflowUrl,
  ]);

  const pidDisplay = projectId.trim() || "example";
  const dataArtifactsFresh = maxMtimeFromTrace(dashboardTrace);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dynamic run
      </h1>
      <div className="mb-6">
        <StepIndicator current={step} />
      </div>

      {step === "dashboard" ? (
        <section
          className="mb-6 rounded-3xl border border-violet-200/80 bg-gradient-to-b from-violet-50/50 to-white p-6 shadow-sm dark:border-violet-900/40 dark:from-violet-950/20 dark:to-zinc-950/80"
          aria-label="Project overview"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Project overview
              </p>
              <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-50">{pidDisplay}</p>
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                Overview refreshed{" "}
                <time dateTime={dashboardFetchedAt ?? undefined}>
                  {dashboardFetchedAt
                    ? new Date(dashboardFetchedAt).toLocaleString()
                    : "—"}
                </time>
                {dataArtifactsFresh ? (
                  <>
                    {" "}
                    · newest <span className="font-mono">data/</span> artifact{" "}
                    <time dateTime={dataArtifactsFresh}>{new Date(dataArtifactsFresh).toLocaleString()}</time>
                  </>
                ) : null}
              </p>
              {lastCalcGwp ? (
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  Last run GWP ≈ <span className="font-mono">{lastCalcGwp}</span> kg CO₂e
                </p>
              ) : null}
              {calcSkipped ? (
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Calculate was skipped (no LCA-ready rows). Fix matching in KB, then use Calculate.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={dashboardLoading || running}
                onClick={() => void loadDashboard(pidDisplay)}
              >
                {dashboardLoading ? "Refreshing…" : "Refresh overview"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={running}
                onClick={() => {
                  setStep("model");
                  syncWorkflowUrl("model");
                }}
              >
                Back to setup
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={running}
                onClick={() => {
                  syncProjectToUrl();
                  void runFullPipeline();
                }}
              >
                Run pipeline again
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Pipeline artifacts
              </h3>
              {dashboardTraceError ? (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">{dashboardTraceError}</p>
              ) : null}
              {!dashboardTrace ? (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {dashboardLoading ? "Loading trace…" : dashboardTraceError ? "" : "No trace loaded."}
                </p>
              ) : (
                <div>
                  <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {dashboardTrace.phases.flatMap((ph) =>
                      ph.files.map((f) => {
                        const optionalPhase = OPTIONAL_TRACE_PHASE_IDS.has(ph.id);
                        return (
                          <li
                            key={`${ph.id}-${f.relativePath}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                {f.label || ph.title}
                              </span>
                              <span
                                className="mt-0.5 block max-w-full font-mono text-[11px] text-zinc-500 dark:text-zinc-400"
                                title={fileBasename(f.relativePath)}
                              >
                                {truncateBasenameFromStart(fileBasename(f.relativePath))}
                              </span>
                            </div>
                            <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              {f.exists ? (
                                <>
                                  {f.mtimeIso ? new Date(f.mtimeIso).toLocaleString() : "ok"}
                                  {f.byteSize != null ? ` · ${formatBytes(f.byteSize)}` : ""}
                                </>
                              ) : optionalPhase ? (
                                <span className="text-zinc-400 dark:text-zinc-500" title={ph.description}>
                                  not written (optional)
                                </span>
                              ) : (
                                <span className="text-zinc-400">missing</span>
                              )}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                  <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    Dynamic run: IFC → parse → enrich → KB → calculate.{" "}
                    <span className="font-mono">-translated.ttl</span> is only from the separate Translate
                    step (<code className="font-mono text-[10px]">POST /api/translate</code>); material→EPD
                    linking for this app is in <span className="font-mono">-kb.ttl</span>.
                  </p>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Elements in this package (KB)
              </h3>
              {dashboardKbError ? (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{dashboardKbError}</p>
              ) : dashboardKb ? (
                <>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {dashboardKb.elementCount}
                    </span>{" "}
                    elements in the linked graph.                     Preview lists up to {dashboardKb.passports.length} row
                    {dashboardKb.passports.length === 1 ? "" : "s"} (unique element names). Index holds{" "}
                    {dashboardKb.passportPreviewTotal || dashboardKb.passports.length} passport name
                    {dashboardKb.passportPreviewTotal === 1 ? "" : "s"}.
                  </p>
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                          <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">
                            Element
                          </th>
                          <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">
                            Type
                          </th>
                          <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">
                            Open
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardKb.passports.map((p, i) => (
                          <tr
                            key={`${p.expressId ?? i}-${i}`}
                            className="border-t border-zinc-100 dark:border-zinc-800"
                          >
                            <td className="max-w-[10rem] truncate px-2 py-1 text-zinc-800 dark:text-zinc-200">
                              {p.elementName ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-zinc-500">
                              {p.ifcType ?? "—"}
                            </td>
                            <td className="px-2 py-1">
                              {typeof p.expressId === "number" && Number.isFinite(p.expressId) ? (
                                <Link
                                  href={bimPassportsElementHref(pidDisplay, p.expressId, p.groupKey, {
                                    from: "workflow",
                                  })}
                                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                                >
                                  Passports
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {dashboardLoading ? "Loading KB…" : "No element list."}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Deep links</h3>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <li>
                <Link
                  href={bimBuildingViewerHref(pidDisplay)}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  3D · Building
                </Link>
                <span className="ml-1 text-xs text-zinc-400">(mesh + orbit)</span>
              </li>
              <li>
                <Link
                  href={bimPassportsHref(pidDisplay)}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  Passports
                </Link>
              </li>
              <li>
                <Link
                  href={`/kb?projectId=${encodeURIComponent(pidDisplay)}`}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  KB
                </Link>
              </li>
              <li>
                <Link
                  href={`/calculate?projectId=${encodeURIComponent(pidDisplay)}`}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  Calculate
                </Link>
              </li>
              <li>
                <Link
                  href={`/timeline?projectId=${encodeURIComponent(pidDisplay)}`}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  Timeline
                </Link>
              </li>
              <li>
                <Link
                  href={`/deliveries?projectId=${encodeURIComponent(pidDisplay)}`}
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  Deliveries
                </Link>
              </li>
              <li>
                <Link
                  href="/timeline/provenance"
                  className="text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-700 dark:text-violet-400"
                >
                  Timeline provenance
                </Link>
              </li>
            </ul>
          </div>
        </section>
      ) : null}

      <section
        className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80"
        aria-label="Run"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Source
            </p>
            <p
              className="mt-1 truncate font-mono text-sm text-zinc-900 dark:text-zinc-50"
              title={PHASE1_LIBRARY_SAMPLES[librarySample].dataFile}
            >
              {PHASE1_LIBRARY_SAMPLES[librarySample].dataFile}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 self-start sm:self-center"
            disabled={running}
            onClick={() => {
              syncProjectToUrl();
              void runFullPipeline();
            }}
          >
            {running ? "Running…" : "Run pipeline"}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Not a dry run: for this <span className="font-mono">projectId</span> it overwrites pipeline
          outputs under <span className="font-mono">data/</span> (IFC copy, base and enriched TTL, KB
          TTL, carbon JSON/TTL as each step produces them). Other project ids are left alone.
        </p>
      </section>

      <details
        className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/80"
        open={configureOpen}
        onToggle={(e) => setConfigureOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
              {configureOpen ? "▼" : "▶"}
            </span>
            Source &amp; project (sample + folder id)
          </span>
        </summary>
        <div className="space-y-5 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              1 · Source
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Same sample library as Phase 1. Switching a sample updates the project id to its
              default.
            </p>
            <div className="mt-3 space-y-2">
              {(
                Object.entries(PHASE1_LIBRARY_SAMPLES) as [
                  Phase1LibrarySampleKey,
                  (typeof PHASE1_LIBRARY_SAMPLES)["schependomlaan"],
                ][]
              ).map(([key, meta]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-sm ${
                    librarySample === key
                      ? "border-violet-400 bg-violet-50/80 dark:border-violet-500 dark:bg-violet-950/30"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="workflow-sample"
                      checked={librarySample === key}
                      disabled={running}
                      onChange={() => {
                        setLibrarySample(key);
                        setProjectId(meta.suggestedProjectId);
                      }}
                      className="shrink-0"
                    />
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {meta.label}
                    </span>
                  </span>
                  <code className="ml-6 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                    data/{meta.dataFile}
                  </code>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              2 · Project name
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Folder id under <code className="font-mono text-xs">data/</code> for generated files.
            </p>
            <div className="mt-2 max-w-md">
              <ProjectIdField
                value={projectId}
                label="Project name"
                onChange={setProjectId}
                disabled={running}
              />
            </div>
          </div>
        </div>
      </details>

      <details
        className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/80"
        open={pipelineDetailsOpen}
        onToggle={(e) => setPipelineDetailsOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
              {pipelineDetailsOpen ? "▼" : "▶"}
            </span>
            Pipeline status &amp; steps
          </span>
        </summary>
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div aria-live="polite" aria-busy={running}>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Running pipeline
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {runLabel || (running ? "Starting…" : "Idle — use Run pipeline above.")}
            </p>
            {running ? (
              <div className="mt-4 space-y-2">
                <div
                  className="w-full rounded-full border border-zinc-200/90 bg-zinc-100/90 p-1 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/80"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pipelineProgressPct)}
                  aria-label="Pipeline progress"
                >
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800/90">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-[width] duration-200 ease-out dark:bg-violet-400"
                      style={{ width: `${Math.min(100, pipelineProgressPct)}%` }}
                    />
                  </div>
                </div>
                <p className="text-center text-[11px] tabular-nums tracking-wide text-zinc-500 dark:text-zinc-400">
                  {Math.round(pipelineProgressPct)}%
                </p>
              </div>
            ) : null}
            {runError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {runError}
              </div>
            ) : null}
            {!running && runError ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep("model");
                    setRunError(null);
                    syncWorkflowUrl("model");
                  }}
                >
                  Back
                </Button>
                <Button type="button" variant="primary" onClick={() => void runFullPipeline()}>
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <WorkflowPageInner />
    </Suspense>
  );
}
