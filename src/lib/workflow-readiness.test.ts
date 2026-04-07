import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkflowReadinessRows, countTimelineAuditEventsInTurtle } from "./workflow-readiness";

test("countTimelineAuditEventsInTurtle counts AuditEvent type blocks", () => {
  const ttl = `
@prefix timeline: <https://tabulas.eu/timeline#> .
a timeline:AuditEvent ;
  timeline:eventAction "manual_note" .
x a timeline:AuditEvent ;
  timeline:eventAction "x" .
`;
  assert.equal(countTimelineAuditEventsInTurtle(ttl), 2);
});

test("countTimelineAuditEventsInTurtle returns 0 for empty", () => {
  assert.equal(countTimelineAuditEventsInTurtle(""), 0);
  assert.equal(countTimelineAuditEventsInTurtle("@prefix t: <#> .\n"), 0);
});

test("buildWorkflowReadinessRows marks chain done when core files exist", () => {
  const snap = (exists: boolean) => ({
    relativePath: "data/x",
    exists,
  });
  const rows = buildWorkflowReadinessRows({
    projectId: "p",
    timelineAuditEventCount: 2,
    files: {
      ifc: snap(true),
      parsedTtl: snap(true),
      enrichedTtl: snap(true),
      kbTtl: snap(true),
      calcJson: snap(true),
      timelineTtl: snap(true),
      deliveriesTtl: snap(false),
      phase0Groups: snap(false),
      bestekBindings: snap(false),
      bestekMatching: snap(false),
      productCoupling: snap(false),
      complianceEvents: snap(false),
      scheduleLinks: snap(false),
    },
  });
  assert.equal(rows.find((r) => r.id === "tech-calc")?.status, "done");
  assert.equal(rows.find((r) => r.id === "audit-events")?.status, "done");
});
