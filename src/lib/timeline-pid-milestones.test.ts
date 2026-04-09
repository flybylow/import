import test from "node:test";
import assert from "node:assert/strict";
import { buildPidTemplateEventPayloads } from "./timeline-pid-template";
import {
  isPidMilestoneKey,
  PID_MACRO_BAND_DOCUMENT_LINES,
  PID_MILESTONE_KEYS,
  PID_MILESTONE_REGISTER_BLURB,
} from "./timeline-pid-milestones";
import { timelineEventToTurtle, timelineFilePrefixes, parseTimelineTtl } from "./timeline-events";
import type { TimelineEventPayload } from "./timeline-events";

test("buildPidTemplateEventPayloads covers all keys in order", () => {
  const payloads = buildPidTemplateEventPayloads({
    baseMs: Date.parse("2025-01-01T12:00:00.000Z"),
    spacingDays: 7,
  });
  assert.equal(payloads.length, PID_MILESTONE_KEYS.length);
  payloads.forEach((p, i) => {
    assert.equal(p.eventAction, "pid_reference_milestone");
    assert.equal(p.pidReferenceFields?.milestoneKey, PID_MILESTONE_KEYS[i]);
    assert.equal(p.source, "pid-template-seed");
  });
});

test("isPidMilestoneKey allowlist", () => {
  assert.equal(isPidMilestoneKey("pid_opened"), true);
  assert.equal(isPidMilestoneKey("not_a_key"), false);
  assert.ok(PID_MILESTONE_KEYS.length >= 8);
});

test("PID_MILESTONE_REGISTER_BLURB covers every milestone key", () => {
  for (const k of PID_MILESTONE_KEYS) {
    const b = PID_MILESTONE_REGISTER_BLURB[k];
    assert.ok(b?.purpose?.trim().length > 0, k);
    assert.ok(b?.typicalDocuments?.trim().length > 0, k);
  }
});

test("PID_MACRO_BAND_DOCUMENT_LINES is three macro bands", () => {
  assert.equal(PID_MACRO_BAND_DOCUMENT_LINES.length, 3);
});

test("pid_reference_milestone round-trip in turtle", () => {
  const payload: TimelineEventPayload = {
    eventId: "test-pid-1",
    timestampIso: "2026-04-07T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "operator",
    eventAction: "pid_reference_milestone",
    source: "form",
    pidReferenceFields: {
      milestoneKey: "pid_opened",
      lifecyclePhase: "1",
      stateHint: "OPENED",
    },
  };
  const block = timelineEventToTurtle(payload);
  const ttl = timelineFilePrefixes() + block;
  const rows = parseTimelineTtl(ttl);
  assert.equal(rows.length, 1);
  const ev = rows[0]!;
  assert.equal(ev.eventAction, "pid_reference_milestone");
  assert.ok(ev.pidReferenceFields);
  assert.equal(ev.pidReferenceFields!.milestoneKey, "pid_opened");
  assert.equal(ev.pidReferenceFields!.lifecyclePhase, "1");
  assert.equal(ev.pidReferenceFields!.stateHint, "OPENED");
});
