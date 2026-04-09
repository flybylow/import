import assert from "node:assert/strict";
import test from "node:test";

import {
  firstPidMilestoneKeyInSameUiBand,
  pidUiBandIdForReferencePhase,
  resolvePidUrlFocus,
} from "./deliveries-pid-url-context";

test("pidUiBandIdForReferencePhase", () => {
  assert.equal(pidUiBandIdForReferencePhase("0"), "pid-tab-design-spec");
  assert.equal(pidUiBandIdForReferencePhase("2"), "pid-tab-site-completion");
  assert.equal(pidUiBandIdForReferencePhase("5"), "pid-tab-handover-after");
});

test("firstPidMilestoneKeyInSameUiBand", () => {
  assert.equal(firstPidMilestoneKeyInSameUiBand("0"), "spec_baseline");
  assert.equal(firstPidMilestoneKeyInSameUiBand("2"), "as_built_package_recorded");
  assert.equal(firstPidMilestoneKeyInSameUiBand("4"), "pv_provisional_signed");
});

test("resolvePidUrlFocus prefers milestone over phase query", () => {
  const sp = new URLSearchParams(
    "pidMilestone=pid_opened&pidPhase=2&projectId=x"
  );
  const f = resolvePidUrlFocus(sp);
  assert.equal(f.milestoneKey, "pid_opened");
  assert.equal(f.referencePhaseFromQuery, "2");
  assert.equal(f.effectivePhase, "1");
});

test("resolvePidUrlFocus phase-only", () => {
  const f = resolvePidUrlFocus(new URLSearchParams("pidPhase=6"));
  assert.equal(f.milestoneKey, null);
  assert.equal(f.referencePhaseFromQuery, "6");
  assert.equal(f.effectivePhase, "6");
});

test("resolvePidUrlFocus invalid tokens", () => {
  const f = resolvePidUrlFocus(new URLSearchParams("pidMilestone=foo&pidPhase=99"));
  assert.equal(f.invalidMilestoneToken, "foo");
  assert.equal(f.invalidPhaseToken, "99");
  assert.equal(f.effectivePhase, null);
});
