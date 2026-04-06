import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_PIPELINE_PHASES,
  WORKFLOW_PIPELINE_PHASE_WEIGHT,
  assertWorkflowPipelineWeightsSum,
  weightsFromDurationsMs,
} from "./workflow-pipeline-progress";

test("phase weights sum to 1", () => {
  assertWorkflowPipelineWeightsSum();
  const s = WORKFLOW_PIPELINE_PHASES.reduce(
    (acc, p) => acc + WORKFLOW_PIPELINE_PHASE_WEIGHT[p],
    0
  );
  assert.ok(Math.abs(s - 1) < 1e-9);
});

test("weightsFromDurationsMs normalizes and matches proportions", () => {
  const w = weightsFromDurationsMs({
    importTriples: 10,
    enrichGraph: 40,
    buildKb: 10,
    kbStatus: 10,
    calculate: 10,
  });
  assert.ok(Math.abs(w.enrichGraph - 0.5) < 1e-9);
  const sum = WORKFLOW_PIPELINE_PHASES.reduce((a, p) => a + w[p], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});
