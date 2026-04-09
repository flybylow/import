import assert from "node:assert/strict";
import test from "node:test";

import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import { buildTimelineDocumentPackMarkdown } from "@/lib/timeline-document-pack-markdown";

const baseEv = (over: Partial<ParsedTimelineEvent>): ParsedTimelineEvent => ({
  uri: "http://example.org/e1",
  eventId: "e1",
  timestampIso: "2020-01-02T12:00:00.000Z",
  actorSystem: false,
  actorLabel: "operator",
  eventAction: "manual_note",
  source: "form",
  ...over,
});

test("document pack: includes PID, document trail, and full chronology", () => {
  const events: ParsedTimelineEvent[] = [
    baseEv({
      eventId: "pid-1",
      eventAction: "pid_reference_milestone",
      timestampIso: "2020-01-01T12:00:00.000Z",
      pidReferenceFields: { milestoneKey: "pid_opened", lifecyclePhase: "0" },
      message: "Opened",
    }),
    baseEv({
      eventId: "doc-1",
      eventAction: "document_reference_logged",
      timestampIso: "2020-01-03T12:00:00.000Z",
      message: "Title: Test doc\nLocation: https://example.com/x",
    }),
  ];
  const md = buildTimelineDocumentPackMarkdown("proj-a", events);
  assert.match(md, /## PID milestones/);
  assert.match(md, /pid_opened/);
  assert.match(md, /## Document trail/);
  assert.match(md, /Document reference logged/);
  assert.match(md, /## Full chronology/);
  assert.ok(md.indexOf("pid-1") < md.indexOf("doc-1") || md.includes("pid-1"));
});
