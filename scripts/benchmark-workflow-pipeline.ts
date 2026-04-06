/**
 * Measure each `/workflow` pipeline HTTP step (same order as `src/app/workflow/page.tsx`).
 * Requires a running Next app (`npm run dev`).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 npx tsx --tsconfig tsconfig.json scripts/benchmark-workflow-pipeline.ts
 *   BASE_URL=http://127.0.0.1:3000 npx tsx --tsconfig tsconfig.json scripts/benchmark-workflow-pipeline.ts -- --sample small --projectId sample-building-bench
 *
 * Prints suggested `WORKFLOW_PIPELINE_PHASE_WEIGHT` and `WORKFLOW_PIPELINE_PHASE_ESTIMATED_MS`
 * for `src/lib/workflow-pipeline-progress.ts`.
 */
import { buildFullCalculateSelectionFromKbStatus } from "@/lib/build-full-calculate-selection";
import {
  weightsFromDurationsMs,
  type WorkflowPipelinePhase,
} from "@/lib/workflow-pipeline-progress";
import { resolvePhase1LibrarySampleKey } from "@/lib/phase1-library-samples";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function timeMs<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = performance.now();
  const result = await fn();
  return { ms: performance.now() - t0, result };
}

function origin(): string {
  const raw = process.env.BASE_URL?.trim() || "http://127.0.0.1:3000";
  return raw.replace(/\/$/, "");
}

async function main() {
  const base = origin();
  const projectId = argValue("--projectId") ?? "workflow-bench-" + Date.now();
  const sample = resolvePhase1LibrarySampleKey(argValue("--sample") ?? "small");
  const skipCalculate = process.argv.includes("--skip-calculate");

  const d: Partial<Record<WorkflowPipelinePhase, number>> = {};

  console.error(`BASE_URL=${base} projectId=${projectId} sample=${sample}\n`);

  let r = await timeMs(() =>
    fetch(`${base}/api/run-example`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sample }),
    })
  );
  d.importTriples = r.ms;
  console.error(`importTriples   ${(r.ms / 1000).toFixed(2)}s  HTTP ${r.result.status}`);
  if (!r.result.ok) {
    console.error(await r.result.text());
    process.exit(1);
  }

  r = await timeMs(() =>
    fetch(`${base}/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
  );
  d.enrichGraph = r.ms;
  console.error(`enrichGraph     ${(r.ms / 1000).toFixed(2)}s  HTTP ${r.result.status}`);
  if (!r.result.ok) {
    console.error(await r.result.text());
    process.exit(1);
  }

  r = await timeMs(() =>
    fetch(`${base}/api/kb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
  );
  d.buildKb = r.ms;
  console.error(`buildKb         ${(r.ms / 1000).toFixed(2)}s  HTTP ${r.result.status}`);
  if (!r.result.ok) {
    console.error(await r.result.text());
    process.exit(1);
  }

  r = await timeMs(() =>
    fetch(
      `${base}/api/kb/status?projectId=${encodeURIComponent(projectId)}` +
        `&includeElementPassports=false&elementPassportsLimit=0`
    )
  );
  d.kbStatus = r.ms;
  console.error(`kbStatus        ${(r.ms / 1000).toFixed(2)}s  HTTP ${r.result.status}`);
  if (!r.result.ok) {
    console.error(await r.result.text());
    process.exit(1);
  }

  const statusJson = (await r.result.json()) as Parameters<
    typeof buildFullCalculateSelectionFromKbStatus
  >[0];
  const selection = buildFullCalculateSelectionFromKbStatus(statusJson);

  if (!skipCalculate && selection.length > 0) {
    r = await timeMs(() =>
      fetch(`${base}/api/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, selection }),
      })
    );
    d.calculate = r.ms;
    console.error(`calculate       ${(r.ms / 1000).toFixed(2)}s  HTTP ${r.result.status} (${selection.length} materials)`);
    if (!r.result.ok) {
      console.error(await r.result.text());
      process.exit(1);
    }
  } else {
    console.error(
      skipCalculate
        ? "calculate       (skipped --skip-calculate)"
        : `calculate       (skipped — empty selection, ${selection.length} materials)`
    );
    d.calculate = Math.max(800, (d.kbStatus ?? 1000) * 0.5);
  }

  const weights = weightsFromDurationsMs(d);
  const totalMs = Object.values(d).reduce((a, b) => a + (b ?? 0), 0);

  console.error(`\nTotal wall time: ${(totalMs / 1000).toFixed(2)}s\n`);
  console.log(`// Copy into src/lib/workflow-pipeline-progress.ts (adjust labels if needed)`);
  console.log(`export const WORKFLOW_PIPELINE_PHASE_WEIGHT: Record<WorkflowPipelinePhase, number> = {`);
  for (const k of [
    "importTriples",
    "enrichGraph",
    "buildKb",
    "kbStatus",
    "calculate",
  ] as const) {
    console.log(`  ${k}: ${weights[k].toFixed(4)},`);
  }
  console.log(`};`);
  console.log(``);
  console.log(`export const WORKFLOW_PIPELINE_PHASE_ESTIMATED_MS: Record<WorkflowPipelinePhase, number> = {`);
  for (const k of [
    "importTriples",
    "enrichGraph",
    "buildKb",
    "kbStatus",
    "calculate",
  ] as const) {
    const ms = Math.round((d[k] ?? 5000) * 1.08);
    console.log(`  ${k}: ${ms},`);
  }
  console.log(`};`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
