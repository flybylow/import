import assert from "node:assert/strict";
import test from "node:test";

import { missingPhaseSlotActionHref } from "@/lib/deliveries-pid-slot-action-href";
import { PID_EXPECTATION_ID_PARAM, PID_TRACE_INTENT_PARAM } from "@/lib/deliveries-pid-url-context";
import { PHASE_DOCUMENT_EXPECTATIONS } from "@/lib/lifecycle-phase-document-expectations";

test("missingPhaseSlotActionHref: spec_baseline uses pid milestone + sign query + register hash", () => {
  const exp = PHASE_DOCUMENT_EXPECTATIONS["0"].find((e) => e.id === "spec_baseline");
  assert.ok(exp);
  const href = missingPhaseSlotActionHref("proj-1", "0", exp);
  assert.ok(href.includes("tab=pid"));
  assert.ok(href.includes("projectId=proj-1"));
  assert.ok(href.includes(`${PID_TRACE_INTENT_PARAM}=sign`));
  assert.ok(href.includes(`${PID_EXPECTATION_ID_PARAM}=spec_baseline`));
  assert.ok(href.includes("pidMilestone=spec_baseline"));
  assert.ok(href.endsWith("#deliveries-pid-register"));
});

test("missingPhaseSlotActionHref: bestek_bindings stays on document hash with sign query", () => {
  const exp = PHASE_DOCUMENT_EXPECTATIONS["0"].find((e) => e.id === "bestek_bindings");
  assert.ok(exp);
  const href = missingPhaseSlotActionHref("proj-1", "0", exp);
  assert.ok(href.includes(`${PID_TRACE_INTENT_PARAM}=sign`));
  assert.ok(href.includes(`${PID_EXPECTATION_ID_PARAM}=bestek_bindings`));
  assert.ok(href.endsWith("#deliveries-pid-document"));
});
