"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import { InfoDetails } from "@/components/InfoDetails";
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
import { appContentWidthClass } from "@/lib/app-page-layout";
import WorkflowReadinessPanel, {
  type WorkflowReadinessApiPayload,
} from "@/components/WorkflowReadinessPanel";

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

/** Short date/time for dashboard rows (no seconds). */
function formatWorkflowDashTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("nl-BE", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short UI names for trace file labels (API English labels from `/api/pipeline/trace`). */
const PIPELINE_ARTIFACT_STEP_NAME: Record<string, string> = {
  "IFC model": "IFC",
  "Parsed graph": "Parsed",
  "Enriched graph": "Enriched",
  "Translated TTL": "Translated",
  "KB / linked graph": "Linked KB",
  "Calc graph TTL": "Calculated",
  "Calc JSON (latest)": "Results",
};

function pipelineArtifactStepName(label: string, phaseTitle: string): string {
  const t = label?.trim() || phaseTitle?.trim() || "—";
  return PIPELINE_ARTIFACT_STEP_NAME[t] ?? t;
}

function fileBasename(relativePath: string): string {
  const seg = relativePath.replace(/\\/g, "/").split("/").pop()?.trim();
  return seg && seg.length > 0 ? seg : relativePath;
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

const iconStroke = "h-4 w-4 shrink-0 stroke-violet-600 dark:stroke-violet-400";
const iconMuted = "h-4 w-4 shrink-0 stroke-zinc-400 dark:stroke-zinc-500";

/** Distinct SVG per artifact type (trace `file.label`). */
function PipelineArtifactIcon(props: { label: string; muted?: boolean }) {
  const cn = props.muted ? iconMuted : iconStroke;
  const l = props.label.trim();
  const stroke = (extra: ReactNode) => (
    <svg
      className={cn}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {extra}
    </svg>
  );
  if (l === "IFC model")
    return stroke(
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v9" />,
    );
  if (l === "Parsed graph")
    return stroke(
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h6M8 9h4" />
      </>,
    );
  if (l === "Enriched graph")
    return stroke(
      <>
        <path d="M12 3L3 8v2M12 3l9 5v2M3 10v6l9 5 9-5v-6" />
        <path d="M12 12v9" />
      </>,
    );
  if (l === "Translated TTL")
    return stroke(
      <>
        <path d="m5 8 6 6M4 14l6-6 2-3M13 14h8M13 18h5" />
        <path d="M19 8v10" />
      </>,
    );
  if (l === "KB / linked graph")
    return stroke(
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
    );
  if (l === "Calc graph TTL")
    return stroke(
      <>
        <circle cx="6" cy="6" r="2.25" />
        <circle cx="18" cy="8" r="2.25" />
        <circle cx="10" cy="18" r="2.25" />
        <path d="M7.5 7.5 9 10M15.75 9.5 12 16.5M7.5 17.5 8.5 12" />
      </>,
    );
  if (l === "Calc JSON (latest)")
    return stroke(
      <>
        <path d="M8 6h12v12H8zM4 10h4M4 14h4" />
        <path d="M11 10h6M11 14h4" />
      </>,
    );
  return stroke(<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />);
}

function pipelineArtifactRowId(phaseId: string, relativePath: string): string {
  return `${phaseId}::${relativePath}`;
}

function workflowArtifactAppLinks(
  fileLabel: string,
  projectId: string,
): { href: string; text: string }[] {
  const pid = projectId.trim() || "example";
  const q = (base: string, extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("projectId", pid);
    if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `${base}?${p.toString()}`;
  };
  const l = fileLabel.trim();
  switch (l) {
    case "IFC model":
      return [
        { href: q("/workflow", { step: "model" }), text: "Setup — IFC & source" },
        { href: bimBuildingViewerHref(pid), text: "3D building view" },
        { href: q("/deliveries"), text: "Deliveries" },
      ];
    case "Parsed graph":
      return [
        { href: q("/workflow", { step: "run" }), text: "Run pipeline" },
        { href: q("/kb"), text: "Knowledge base" },
      ];
    case "Enriched graph":
      return [
        { href: q("/workflow", { step: "run" }), text: "Run pipeline" },
        { href: q("/kb"), text: "Knowledge base" },
      ];
    case "Translated TTL":
      return [
        { href: q("/kb"), text: "Knowledge base" },
        { href: q("/workflow", { step: "run" }), text: "Run / translate" },
      ];
    case "KB / linked graph":
      return [
        { href: q("/kb"), text: "Open KB" },
        { href: q("/calculate"), text: "Calculate" },
        { href: bimPassportsHref(pid), text: "Passports" },
      ];
    case "Calc graph TTL":
    case "Calc JSON (latest)":
      return [
        { href: q("/calculate"), text: "Calculate & outputs" },
        { href: q("/kb"), text: "Knowledge base" },
        { href: q("/timeline"), text: "Timeline" },
      ];
    default:
      return [{ href: q("/workflow", { step: "dashboard" }), text: "Dashboard" }];
  }
}

/** Icon row; click a step for description + links. */
function WorkflowPipelineArtifactsExplorer(props: {
  trace: PipelineTraceJson;
  projectId: string;
}) {
  const { trace, projectId } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  let selected: { ph: PipelineTraceJson["phases"][number]; f: PipelineTraceJson["phases"][number]["files"][number] } | null =
    null;
  if (selectedId) {
    for (const ph of trace.phases) {
      for (const f of ph.files) {
        if (pipelineArtifactRowId(ph.id, f.relativePath) === selectedId) {
          selected = { ph, f };
          break;
        }
      }
      if (selected) break;
    }
  }

  return (
    <div
      className="rounded border border-zinc-200 bg-white px-1.5 py-1.5 text-left dark:border-zinc-800 dark:bg-zinc-950/80"
      aria-label="Pipeline artifacts"
    >
      <div className="flex flex-wrap gap-1.5">
        {trace.phases.flatMap((ph) => {
          const optionalPhase = OPTIONAL_TRACE_PHASE_IDS.has(ph.id);
          return ph.files.map((f) => {
            const step = pipelineArtifactStepName(f.label || "", ph.title);
            const rowId = pipelineArtifactRowId(ph.id, f.relativePath);
            const isSel = selectedId === rowId;
            const missing = !f.exists && !optionalPhase;
            const optionalMissing = !f.exists && optionalPhase;
            const meta =
              f.exists && f.mtimeIso ? formatWorkflowDashTs(f.mtimeIso).split(",")[0]?.trim() ?? "—" : null;
            return (
              <button
                key={rowId}
                type="button"
                aria-pressed={isSel}
                onClick={() => setSelectedId((prev) => (prev === rowId ? null : rowId))}
                className={`flex w-[4.75rem] cursor-pointer flex-col items-center rounded-md border px-1 py-1 text-center transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                  isSel
                    ? "ring-2 ring-violet-500/80 ring-offset-1 ring-offset-zinc-50 dark:ring-offset-zinc-950"
                    : ""
                } ${
                  missing
                    ? "border-amber-200/90 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
                    : optionalMissing
                      ? "border-dashed border-zinc-300/90 bg-white/40 dark:border-zinc-600 dark:bg-zinc-900/30"
                      : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/50"
                }`}
              >
                <PipelineArtifactIcon label={f.label || ""} muted={!f.exists} />
                <span className="mt-0.5 line-clamp-2 min-h-[1.5rem] text-[9px] font-medium leading-tight text-zinc-800 dark:text-zinc-200">
                  {step}
                  {optionalMissing ? (
                    <span className="block text-[7px] font-normal text-zinc-400">opt</span>
                  ) : null}
                </span>
                <span className="mt-0.5 line-clamp-1 w-full text-[8px] tabular-nums text-zinc-500 dark:text-zinc-500">
                  {f.exists ? (
                    <>
                      {meta}
                      {f.byteSize != null ? ` · ${formatBytes(f.byteSize)}` : null}
                    </>
                  ) : optionalMissing ? (
                    "—"
                  ) : (
                    "Missing"
                  )}
                </span>
              </button>
            );
          });
        })}
      </div>

      {selected ? (
        <div
          className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60"
          role="region"
          aria-label={`${pipelineArtifactStepName(selected.f.label || "", selected.ph.title)} — details`}
        >
          <p className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-50">
            {pipelineArtifactStepName(selected.f.label || "", selected.ph.title)}
            <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
              ({selected.f.label || selected.ph.title})
            </span>
          </p>
          <p className="mt-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
            {selected.ph.description}
          </p>
          <p className="mt-1 font-mono text-[9px] text-zinc-500 dark:text-zinc-500">
            {selected.f.relativePath}
            {selected.f.exists && selected.f.mtimeIso ? (
              <span className="mt-0.5 block font-sans text-[10px] tabular-nums">
                {formatWorkflowDashTs(selected.f.mtimeIso)}
                {selected.f.byteSize != null ? ` · ${formatBytes(selected.f.byteSize)}` : null}
              </span>
            ) : null}
            {!selected.f.exists ? (
              <span className="mt-0.5 block font-sans text-[10px] text-amber-800 dark:text-amber-200">
                {OPTIONAL_TRACE_PHASE_IDS.has(selected.ph.id)
                  ? "Optional file — not on disk."
                  : "Missing — run the pipeline for this project."}
              </span>
            ) : null}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {workflowArtifactAppLinks(selected.f.label || "", projectId).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[11px] font-medium text-violet-600 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300"
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function stepIndicatorPillClass(active: boolean, compact: boolean): string {
  const pad = compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return active
    ? `rounded border border-violet-300 bg-violet-50 font-medium text-violet-900 dark:border-violet-600 dark:bg-violet-950/50 dark:text-violet-100 ${pad}`
    : `rounded border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500 ${pad}`;
}

function workflowStepHref(projectId: string, step: WizardStep): string {
  const q = new URLSearchParams();
  q.set("projectId", projectId.trim() || "example");
  q.set("step", step);
  return `/workflow?${q.toString()}`;
}

function StepIndicator(props: {
  current: WizardStep;
  projectId: string;
  /** Abbreviated steps + tighter pills (dashboard-style header). */
  compact?: boolean;
}) {
  const compact = Boolean(props.compact);
  const order: WizardStep[] = ["model", "run", "dashboard"];
  const labels: Record<WizardStep, string> = compact
    ? { model: "1·Cfg", run: "2·Run", dashboard: "3·Db" }
    : { model: "1 · Setup", run: "2 · Run", dashboard: "3 · Dashboard" };
  const titles: Record<WizardStep, string> = {
    model: "Step 1 — Setup",
    run: "Step 2 — Run pipeline",
    dashboard: "Step 3 — Dashboard",
  };
  const idx = order.indexOf(props.current);
  const pid = props.projectId.trim() || "example";

  return (
    <nav aria-label="Workflow steps" className="flex flex-wrap items-center gap-1.5">
      <ol className="flex flex-wrap items-center gap-1.5">
        {order.map((k, i) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <Link
              href={workflowStepHref(pid, k)}
              className={`${stepIndicatorPillClass(i <= idx, compact)} inline-block no-underline hover:opacity-90`}
              aria-current={props.current === k ? "step" : undefined}
              title={titles[k]}
            >
              {labels[k]}
            </Link>
            {i < order.length - 1 ? (
              <span className="text-zinc-300 text-[10px] dark:text-zinc-600" aria-hidden>
                ·
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
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
  const [readinessPayload, setReadinessPayload] = useState<WorkflowReadinessApiPayload | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
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
      q.set("step", nextStep);
      router.replace(`/workflow?${q.toString()}`, { scroll: false });
    },
    [projectId, router, searchParams]
  );

  const resetDashboardSnapshot = useCallback(() => {
    setDashboardTrace(null);
    setDashboardKb(null);
    setDashboardKbError(null);
    setDashboardTraceError(null);
    setReadinessPayload(null);
    setReadinessError(null);
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

      setReadinessError(null);
      const rd = await fetch(
        `/api/workflow/readiness?projectId=${encodeURIComponent(pid)}`
      );
      if (rd.ok) {
        setReadinessPayload((await rd.json()) as WorkflowReadinessApiPayload);
      } else {
        setReadinessPayload(null);
        setReadinessError((await rd.text()) || rd.statusText || "Readiness request failed");
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
      setReadinessPayload(null);
      const msg = e instanceof Error ? e.message : String(e);
      setDashboardTraceError(msg);
      setDashboardKbError(msg);
      setReadinessError(msg);
    } finally {
      setDashboardFetchedAt(new Date().toISOString());
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = searchParams.get("step");
    if (s === "dashboard" || s === "model" || s === "run") {
      setStep(s);
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

  const dashWidget =
    "min-w-0 w-full max-w-[19rem] rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";

  return (
    <div className={`${appContentWidthClass} py-6`}>
      {step === "dashboard" ? (
        <header
          className="mb-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950/80"
          aria-label="Workflow dashboard header"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="shrink-0 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Workflow
                </h1>
                <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
                  ·
                </span>
                <StepIndicator current={step} projectId={pidDisplay} compact />
              </div>
              <p
                className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-50"
                title={
                  `Project ${pidDisplay}` +
                  (dashboardFetchedAt
                    ? ` · dashboard refreshed ${dashboardFetchedAt}`
                    : "") +
                  (dataArtifactsFresh ? ` · newest artifact ${dataArtifactsFresh}` : "")
                }
              >
                <svg
                  className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M3 6a2 2 0 012-2h3.38a2 2 0 011.41.59l1.62 1.62H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
                </svg>
                <span className="min-w-0 truncate">
                  {pidDisplay}
                  <span className="font-normal tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
                    {" "}
                    · {formatWorkflowDashTs(dashboardFetchedAt)}
                    {dataArtifactsFresh ? ` · ${formatWorkflowDashTs(dataArtifactsFresh)}` : null}
                  </span>
                </span>
              </p>
              {lastCalcGwp ? (
                <p className="mt-2 text-[10px] text-zinc-700 dark:text-zinc-300">
                  GWP ≈ <span className="font-mono">{lastCalcGwp}</span> kg CO₂e
                </p>
              ) : null}
              {calcSkipped ? (
                <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                  Calc skipped — fix KB, then Calculate.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end sm:pt-0.5">
              <Button
                type="button"
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                disabled={dashboardLoading || running}
                onClick={() => void loadDashboard(pidDisplay)}
              >
                {dashboardLoading ? "…" : "Refresh"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                disabled={running}
                onClick={() => {
                  setStep("model");
                  syncWorkflowUrl("model");
                }}
              >
                Setup
              </Button>
              <Button
                type="button"
                variant="primary"
                className="px-2.5 py-1 text-xs"
                disabled={running}
                onClick={() => {
                  syncProjectToUrl();
                  void runFullPipeline();
                }}
              >
                Run
              </Button>
            </div>
          </div>
        </header>
      ) : (
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Workflow
          </h1>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <StepIndicator current={step} projectId={pidDisplay} compact />
          <Link
            href={`/workflow?step=dashboard&projectId=${encodeURIComponent(pidDisplay)}`}
            className="ml-auto shrink-0 text-xs font-medium text-violet-700 underline decoration-violet-400/60 underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-200"
            title="Step 3 — Dashboard"
          >
            → Db
          </Link>
        </div>
      )}

      {step === "dashboard" ? (
        <div
          className="mb-4 grid justify-items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(17.5rem,1fr))]"
          aria-label="Workflow dashboard widgets"
        >
          <WorkflowReadinessPanel
            payload={readinessPayload}
            error={readinessError}
            loading={dashboardLoading}
            compact
          />

          <div className={dashWidget}>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Pipeline · <span className="font-normal normal-case text-zinc-500">artifacts</span>
            </h3>
            {dashboardTraceError ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{dashboardTraceError}</p>
            ) : null}
            {!dashboardTrace ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {dashboardLoading ? "Loading…" : dashboardTraceError ? "" : "No trace."}
              </p>
            ) : (
              <div className="mt-1.5">
                <WorkflowPipelineArtifactsExplorer trace={dashboardTrace} projectId={pidDisplay} />
              </div>
            )}
          </div>

          <div className={dashWidget}>
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-50">
                  Elements (KB)
                </h3>
                {dashboardKb ? (
                  <InfoDetails label="What these KB numbers mean">
                    <p className="mb-2 font-medium text-zinc-800 dark:text-zinc-200">
                      Same figures as the line below — from{" "}
                      <code className="rounded bg-zinc-100 px-0.5 font-mono dark:bg-zinc-800">
                        GET /api/kb/status
                      </code>{" "}
                      for this project.
                    </p>
                    <ul className="list-inside list-disc space-y-1">
                      <li>
                        <span className="font-mono tabular-nums">{dashboardKb.elementCount}</span> —
                        total IFC elements in the linked knowledge-base graph.
                      </li>
                      <li>
                        <span className="font-mono tabular-nums">{dashboardKb.passports.length}</span> —
                        rows loaded in this preview (one representative element per distinct{" "}
                        <code className="font-mono">schema:name</code>, API cap 50). Only ~20 rows fit on
                        screen — scroll inside the table panel for the rest.
                      </li>
                      <li>
                        <span className="font-mono tabular-nums">
                          {dashboardKb.passportPreviewTotal || dashboardKb.passports.length}
                        </span>{" "}
                        — distinct passport names in the full KB index (can exceed the preview row count).
                      </li>
                    </ul>
                  </InfoDetails>
                ) : null}
              </div>
              {dashboardKbError ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{dashboardKbError}</p>
              ) : dashboardKb ? (
                <>
                  <div
                    className="mt-1 max-h-[22rem] overflow-x-hidden overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700"
                    aria-label="KB element preview — scroll for more rows"
                  >
                    <div
                      className="sticky top-0 z-10 flex min-w-0 gap-2 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Element
                      </span>
                      <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Type
                      </span>
                    </div>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {dashboardKb.passports.map((p, i) => {
                        const name = p.elementName ?? "—";
                        const expressId = p.expressId;
                        const typeStr = p.ifcType ?? "—";
                        return (
                          <li key={`${expressId ?? i}-${i}`} className="flex min-w-0 gap-2 px-2 py-1">
                            <div className="inline-block min-w-0 max-w-[min(14rem,calc(100%-5.5rem))] shrink-0 align-top">
                              {typeof expressId === "number" && Number.isFinite(expressId) ? (
                                <Link
                                  href={bimPassportsElementHref(pidDisplay, expressId, p.groupKey, {
                                    from: "workflow",
                                  })}
                                  className="block w-full truncate text-[11px] leading-snug text-violet-600 underline decoration-violet-400/60 underline-offset-1 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                                  title={name}
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span
                                  className="block w-full truncate text-[11px] leading-snug text-zinc-800 dark:text-zinc-200"
                                  title={name}
                                >
                                  {name}
                                </span>
                              )}
                            </div>
                            <div
                              className="min-w-0 flex-1 truncate font-mono text-[10px] leading-snug text-zinc-600 dark:text-zinc-400"
                              title={typeStr}
                            >
                              {typeStr}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {dashboardLoading ? "Loading…" : "No list."}
                </p>
              )}
          </div>

          <div className={dashWidget}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Links
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1 text-[10px]">
              <Link
                href={bimBuildingViewerHref(pidDisplay)}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                3D
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href={bimPassportsHref(pidDisplay)}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                PP
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href={`/kb?projectId=${encodeURIComponent(pidDisplay)}`}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                KB
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href={`/calculate?projectId=${encodeURIComponent(pidDisplay)}`}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                Calc
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href={`/timeline?projectId=${encodeURIComponent(pidDisplay)}`}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                TL
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href={`/deliveries?tab=ingest&projectId=${encodeURIComponent(pidDisplay)}`}
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                Del
              </Link>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <Link
                href="/timeline/provenance"
                className="text-violet-600 underline decoration-violet-400/50 underline-offset-2 dark:text-violet-400"
              >
                TL·prov
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {step !== "dashboard" ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <Suspense
      fallback={
        <div className={`${appContentWidthClass} py-10 text-sm text-zinc-500 dark:text-zinc-400`}>
          Loading…
        </div>
      }
    >
      <WorkflowPageInner />
    </Suspense>
  );
}
