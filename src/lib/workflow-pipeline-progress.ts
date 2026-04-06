/**
 * Dynamic run (`/workflow`) — progress bar uses **relative phase weights** (sum = 1).
 *
 * Refresh weights from real timings:
 *   npm run dev
 *   npm run benchmark:workflow-pipeline
 *
 * Defaults assume **enrich** dominates (large IFC walk); tune after benchmarking.
 */
export type WorkflowPipelinePhase =
  | "importTriples"
  | "enrichGraph"
  | "buildKb"
  | "kbStatus"
  | "calculate";

export const WORKFLOW_PIPELINE_PHASES: readonly WorkflowPipelinePhase[] = [
  "importTriples",
  "enrichGraph",
  "buildKb",
  "kbStatus",
  "calculate",
] as const;

/** Fraction of total wall time per phase (must sum to 1). */
export const WORKFLOW_PIPELINE_PHASE_WEIGHT: Record<WorkflowPipelinePhase, number> = {
  importTriples: 0.14,
  enrichGraph: 0.48,
  buildKb: 0.22,
  kbStatus: 0.03,
  calculate: 0.13,
};

/**
 * Expected duration per phase (ms) — drives **in-phase** smooth fill before the HTTP call returns.
 * If a request finishes sooner, we snap forward on completion; if slower, the bar sits at ~93% of
 * the slice until the response arrives.
 */
export const WORKFLOW_PIPELINE_PHASE_ESTIMATED_MS: Record<WorkflowPipelinePhase, number> = {
  importTriples: 55_000,
  enrichGraph: 280_000,
  buildKb: 75_000,
  kbStatus: 10_000,
  calculate: 45_000,
};

export function assertWorkflowPipelineWeightsSum(): void {
  const s = WORKFLOW_PIPELINE_PHASES.reduce(
    (acc, p) => acc + WORKFLOW_PIPELINE_PHASE_WEIGHT[p],
    0
  );
  if (Math.abs(s - 1) > 1e-6) {
    throw new Error(`WORKFLOW_PIPELINE_PHASE_WEIGHT must sum to 1, got ${s}`);
  }
}

/** Map benchmark output (ms per label) → normalized weights summing to 1. */
export function weightsFromDurationsMs(
  durations: Partial<Record<WorkflowPipelinePhase, number>>
): Record<WorkflowPipelinePhase, number> {
  const out: Record<WorkflowPipelinePhase, number> = {
    importTriples: 0,
    enrichGraph: 0,
    buildKb: 0,
    kbStatus: 0,
    calculate: 0,
  };
  let sum = 0;
  for (const p of WORKFLOW_PIPELINE_PHASES) {
    const v = Math.max(0, durations[p] ?? 0);
    out[p] = v;
    sum += v;
  }
  if (sum <= 0) return { ...WORKFLOW_PIPELINE_PHASE_WEIGHT };
  for (const p of WORKFLOW_PIPELINE_PHASES) {
    out[p] = out[p] / sum;
  }
  return out;
}
