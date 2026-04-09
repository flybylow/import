import assert from "node:assert/strict";
import test from "node:test";

import { pidDocumentHotStepsForPhase } from "@/lib/deliveries-pid-document-hot-steps";

test("pidDocumentHotStepsForPhase: empty timeline yields phase-1 PID opened as missing", () => {
  const { missing, guidance } = pidDocumentHotStepsForPhase("1", []);
  assert.equal(guidance.length, 0);
  assert.ok(missing.some((m) => m.expectation.id === "pid_opened"));
  assert.equal(missing.find((m) => m.expectation.id === "pid_opened")?.emphasis, "pid_milestone");
});

test("pidDocumentHotStepsForPhase: satisfied pid_opened removes that slot", () => {
  const ev = {
    eventId: "e1",
    timestampIso: "2026-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "u",
    eventAction: "pid_reference_milestone" as const,
    pidReferenceFields: { milestoneKey: "pid_opened", lifecyclePhase: "1" },
  };
  const { missing } = pidDocumentHotStepsForPhase("1", [ev]);
  assert.ok(!missing.some((m) => m.expectation.id === "pid_opened"));
});
