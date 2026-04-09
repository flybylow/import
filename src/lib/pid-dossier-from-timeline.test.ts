import test from "node:test";
import assert from "node:assert/strict";

import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import {
  buildPidDossierChapters,
  trailingNonPidAfterLastMilestone,
} from "@/lib/pid-dossier-from-timeline";

function pidEv(
  id: string,
  iso: string,
  key: string,
  extra?: Partial<ParsedTimelineEvent>
): ParsedTimelineEvent {
  return {
    uri: `urn:${id}`,
    eventId: id,
    timestampIso: iso,
    actorSystem: false,
    actorLabel: "test",
    eventAction: "pid_reference_milestone",
    pidReferenceFields: { milestoneKey: key },
    ...extra,
  };
}

function noteEv(id: string, iso: string): ParsedTimelineEvent {
  return {
    uri: `urn:${id}`,
    eventId: id,
    timestampIso: iso,
    actorSystem: false,
    actorLabel: "test",
    eventAction: "manual_note",
    message: "note",
  };
}

test("leading indicators sit after prior milestone and before first of this key", () => {
  const events: ParsedTimelineEvent[] = [
    noteEv("n0", "2020-01-01T10:00:00.000Z"),
    pidEv("p0", "2020-02-01T12:00:00.000Z", "spec_baseline"),
    noteEv("n1", "2020-02-15T12:00:00.000Z"),
    pidEv("p1", "2020-03-01T12:00:00.000Z", "pid_opened"),
  ];
  const ch = buildPidDossierChapters(events);
  const spec = ch.find((c) => c.key === "spec_baseline")!;
  const opened = ch.find((c) => c.key === "pid_opened")!;
  assert.equal(spec.milestoneEvents.length, 1);
  assert.equal(spec.leadingIndicators.map((e) => e.eventId).join(","), "n0");
  assert.equal(opened.leadingIndicators.map((e) => e.eventId).join(","), "n1");
});

test("trailing non-PID after last milestone", () => {
  const events: ParsedTimelineEvent[] = [
    pidEv("p0", "2020-01-01T12:00:00.000Z", "spec_baseline"),
    noteEv("n1", "2020-02-01T12:00:00.000Z"),
  ];
  const ch = buildPidDossierChapters(events);
  const tail = trailingNonPidAfterLastMilestone(events, ch);
  assert.equal(tail.length, 1);
  assert.equal(tail[0].eventId, "n1");
});
