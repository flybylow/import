import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTimelineTtl,
  timelineEventToTurtle,
  timelineFilePrefixes,
  compareParsedTimelineEventsAsc,
} from "./timeline-events";
import type { TimelineEventPayload } from "./timeline-events";

function ttlFromPayloads(payloads: TimelineEventPayload[]): string {
  return timelineFilePrefixes() + payloads.map((p) => timelineEventToTurtle(p)).join("");
}

const basePayload = (overrides: Partial<TimelineEventPayload>): TimelineEventPayload => ({
  eventId: "e-default",
  timestampIso: "2026-01-01T12:00:00.000Z",
  actorSystem: false,
  actorLabel: "test",
  eventAction: "manual_note",
  ...overrides,
});

test("parseTimelineTtl sorts oldest-first by parsed instant, not string order", () => {
  const ttl = ttlFromPayloads([
    basePayload({
      eventId: "older",
      timestampIso: "2026-04-06T12:00:00.000Z",
    }),
    basePayload({
      eventId: "newer",
      timestampIso: "2026-04-07T12:00:00.000Z",
    }),
  ]);
  const rows = parseTimelineTtl(ttl);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.eventId, "older");
  assert.equal(rows[1]!.eventId, "newer");
});

test("parseTimelineTtl treats offset datetime equal to UTC (tie-break eventId asc)", () => {
  const ttl = ttlFromPayloads([
    basePayload({
      eventId: "zzz",
      timestampIso: "2026-04-06T14:00:00+02:00",
    }),
    basePayload({
      eventId: "aaa",
      timestampIso: "2026-04-06T12:00:00.000Z",
    }),
  ]);
  const rows = parseTimelineTtl(ttl);
  assert.equal(rows.length, 2);
  assert.ok(
    timelineTimestampSortKeyForTest(rows[0]!.timestampIso) ===
      timelineTimestampSortKeyForTest(rows[1]!.timestampIso)
  );
  assert.equal(rows[0]!.eventId, "aaa");
  assert.equal(rows[1]!.eventId, "zzz");
});

function timelineTimestampSortKeyForTest(iso: string): number {
  const t = Date.parse(iso.trim());
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

test("Z vs fractional-Z same instant: tie-break eventId ascending", () => {
  const a = {
    uri: "u1",
    eventId: "m",
    timestampIso: "2026-04-06T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "manual_note" as const,
  };
  const b = {
    uri: "u2",
    eventId: "z",
    timestampIso: "2026-04-06T12:00:00Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "manual_note" as const,
  };
  assert.equal(Date.parse(a.timestampIso), Date.parse(b.timestampIso));
  const sorted = [b, a].sort(compareParsedTimelineEventsAsc);
  assert.equal(sorted[0]!.eventId, "m");
  assert.equal(sorted[1]!.eventId, "z");
});
