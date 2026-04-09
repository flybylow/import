import assert from "node:assert/strict";
import test from "node:test";

import { parseTimelineTtl } from "@/lib/timeline-events";

import { serializeTimelineTtlFromParsedEvents, removeTimelineEventsFromDisk } from "./delete-timeline-events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SAMPLE_TTL = `@prefix timeline: <https://tabulas.eu/timeline#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .


# AuditEvent 2026-04-06T16:24:23.823Z eventId=aaa
timeline:event-aaa
    a timeline:AuditEvent ;
    timeline:eventId "aaa" ;
    timeline:timestamp "2026-04-06T16:24:23.823Z"^^xsd:dateTime ;
    timeline:actorSystem "true"^^xsd:boolean ;
    timeline:actorLabel "x" ;
    timeline:eventAction "manual_note" .

# AuditEvent 2026-04-07T16:24:23.823Z eventId=bbb
timeline:event-bbb
    a timeline:AuditEvent ;
    timeline:eventId "bbb" ;
    timeline:timestamp "2026-04-07T16:24:23.823Z"^^xsd:dateTime ;
    timeline:actorSystem "false"^^xsd:boolean ;
    timeline:actorLabel "y" ;
    timeline:eventAction "manual_note" .
`;

test("serializeTimelineTtlFromParsedEvents round-trips count and ids", () => {
  const parsed = parseTimelineTtl(SAMPLE_TTL);
  assert.equal(parsed.length, 2);
  const again = parseTimelineTtl(serializeTimelineTtlFromParsedEvents(parsed));
  assert.equal(again.length, 2);
  assert.deepEqual(
    again.map((e) => e.eventId).sort(),
    ["aaa", "bbb"]
  );
});

test("removeTimelineEventsFromDisk drops listed ids", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bimimport-tl-"));
  const projectId = "testproj_del_tl";
  const dataDir = path.join(dir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const ttlPath = path.join(dataDir, `${projectId}-timeline.ttl`);
  fs.writeFileSync(ttlPath, SAMPLE_TTL, "utf-8");
  const r = removeTimelineEventsFromDisk(projectId, ["aaa"], dir);
  assert.equal(r.removedCount, 1);
  assert.equal(r.remainingCount, 1);
  const left = parseTimelineTtl(fs.readFileSync(ttlPath, "utf-8"));
  assert.equal(left.length, 1);
  assert.equal(left[0]!.eventId, "bbb");
});
