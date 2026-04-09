import test from "node:test";
import assert from "node:assert/strict";

import { buildDeliveriesPidCustomSlotTimelineMessage } from "@/lib/deliveries-pid-custom-slot-message";
import {
  PHASE_DOCUMENT_EXPECTATIONS,
  matchExpectationEvents,
} from "@/lib/lifecycle-phase-document-expectations";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";
import { REFERENCE_PHASE_IDS } from "@/lib/timeline-reference-phase";

test("PHASE_DOCUMENT_EXPECTATIONS covers phases 0–9", () => {
  for (const p of REFERENCE_PHASE_IDS) {
    assert.ok(PHASE_DOCUMENT_EXPECTATIONS[p]?.length, `phase ${p}`);
  }
});

test("matchExpectationEvents finds EPCIS in phase 2 bucket", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "e1",
      timestampIso: "2026-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "epcis_supply_chain_event",
    },
  ];
  const ex = PHASE_DOCUMENT_EXPECTATIONS["2"].find((x) => x.id === "epcis")!;
  assert.equal(matchExpectationEvents(events, ex).length, 1);
});

test("matchExpectationEvents finds pid_opened milestone", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "p1",
      timestampIso: "2026-05-06T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "pid_reference_milestone",
      pidReferenceFields: { milestoneKey: "pid_opened", lifecyclePhase: "1" },
    },
  ];
  const ex = PHASE_DOCUMENT_EXPECTATIONS["1"][0]!;
  assert.equal(ex.id, "pid_opened");
  assert.equal(matchExpectationEvents(events, ex).length, 1);
});

test("guidanceOnly expectations never match timeline rows", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "d1",
      timestampIso: "2026-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "document_original_stored",
    },
  ];
  const ex = PHASE_DOCUMENT_EXPECTATIONS["3"].find((e) => e.id === "handover_typical_pack")!;
  assert.ok(ex.guidanceOnly);
  assert.equal(matchExpectationEvents(events, ex).length, 0);
});

test("stored_originals matches document_original_stored in phase 2 bucket", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "u1",
      timestampIso: "2026-02-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "document_original_stored",
    },
  ];
  const ex = PHASE_DOCUMENT_EXPECTATIONS["2"].find((e) => e.id === "stored_originals")!;
  assert.equal(matchExpectationEvents(events, ex).length, 1);
});

test("structured manual_note with expectationId satisfies checklist slot", () => {
  const msg = buildDeliveriesPidCustomSlotTimelineMessage({
    label: "Werfverslag",
    phaseDigit: "2",
    notes: "",
    expectationId: "site_report",
  });
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "n1",
      timestampIso: "2026-03-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "manual_note",
      message: msg,
    },
  ];
  const ex = PHASE_DOCUMENT_EXPECTATIONS["2"].find((e) => e.id === "site_report")!;
  assert.equal(matchExpectationEvents(events, ex).length, 1);
});
