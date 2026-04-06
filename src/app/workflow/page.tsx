"use client";

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

type WizardStep = "model" | "run";

function StepIndicator(props: {
  current: WizardStep;
}) {
  const order: WizardStep[] = ["model", "run"];
  const labels: Record<WizardStep, string> = {
    model: "1 · Model",
    run: "2 · Run",
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

  const runFullPipeline = useCallback(async () => {
    setRunError(null);
    setStep("run");
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
        showToast({
          type: "error",
          message:
            "Nothing to calculate (quantities / LCA-ready EPD). Opening BIM viewer — use Phase 3 for details.",
        });
        router.replace(bimBuildingViewerHref(pid));
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
      showToast({
        type: "success",
        message: `Pipeline finished (GWP ≈ ${total} kg CO₂e). Opening BIM viewer…`,
      });
      router.replace(bimBuildingViewerHref(pid));
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [
    beginPipelinePhaseVisual,
    cancelPipelineProgressAnim,
    endPipelinePhaseVisual,
    librarySample,
    projectId,
    router,
    showToast,
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dynamic run
      </h1>

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
          <div className="mb-3">
            <StepIndicator current={step} />
          </div>
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
