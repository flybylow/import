import test from "node:test";
import assert from "node:assert/strict";

import { actorLaneForTimelineEvent } from "@/lib/timeline-actor-lanes";
import type { TimelineEventAction } from "@/lib/timeline-events-vocab";

function lane(
  eventAction: TimelineEventAction,
  actorSystem = false
): ReturnType<typeof actorLaneForTimelineEvent> {
  return actorLaneForTimelineEvent({ eventAction, actorSystem });
}

test("actor lanes: Bouwheer (bo)", () => {
  assert.equal(lane("pid_reference_milestone"), "bo");
  assert.equal(lane("manual_note"), "bo");
  assert.equal(lane("data_exported"), "bo");
  assert.equal(lane("compliance_evaluation_recorded"), "bo");
});

test("actor lanes: Architect", () => {
  assert.equal(lane("model_imported"), "architect");
  assert.equal(lane("bestek_bindings_milestone"), "architect");
});

test("actor lanes: Construction", () => {
  assert.equal(lane("delivery_document_added"), "construction");
  assert.equal(lane("document_reference_logged"), "construction");
  assert.equal(lane("document_original_stored"), "construction");
  assert.equal(lane("product_coupling_updated"), "construction");
});

test("actor lanes: system → Other", () => {
  assert.equal(actorLaneForTimelineEvent({ eventAction: "manual_note", actorSystem: true }), "other");
});
