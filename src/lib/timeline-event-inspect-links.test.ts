import test from "node:test";
import assert from "node:assert/strict";

import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import {
  collectTimelineInspectLinks,
  timelineEventDeepLink,
} from "@/lib/timeline-event-inspect-links";

test("timelineEventDeepLink encodes project and event ids", () => {
  assert.equal(
    timelineEventDeepLink("my project", "evt-1"),
    "/timeline?projectId=my+project&eventId=evt-1"
  );
});

test("collectTimelineInspectLinks returns only the timeline deep link", () => {
  const ev: ParsedTimelineEvent = {
    uri: "urn:x",
    eventId: "abc",
    timestampIso: "2020-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "u",
    eventAction: "manual_note",
    targetExpressId: 33028,
  };
  const links = collectTimelineInspectLinks("example", ev);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.label, "Open on timeline");
  assert.ok(links[0]!.href.includes("projectId=example"));
  assert.ok(links[0]!.href.includes("eventId=abc"));
});

test("collectTimelineInspectLinks is empty without project or event id", () => {
  const ev: ParsedTimelineEvent = {
    uri: "urn:x",
    eventId: "",
    timestampIso: "2020-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "u",
    eventAction: "manual_note",
  };
  assert.equal(collectTimelineInspectLinks("x", ev).length, 0);
  assert.equal(
    collectTimelineInspectLinks("", {
      ...ev,
      eventId: "e",
    }).length,
    0
  );
});
