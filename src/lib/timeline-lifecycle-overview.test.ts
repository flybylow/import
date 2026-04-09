import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLifecycleActorPhaseMatrix,
  buildLifecycleOverview,
  buildLifecyclePhaseActionMatrix,
  eventReferencePhase,
  groupLifecycleEventsByPhase,
  lifecycleActorDisplayLabel,
  lifecycleMatrixEventIconKind,
  lifecycleMatrixEventTitle,
  lifecycleMatrixEventTitleShort,
  phaseBucketTabForEventId,
  timelineJumpToNowEventId,
} from "@/lib/timeline-lifecycle-overview";
import type { LifecycleOverviewEvent } from "@/lib/timeline-lifecycle-overview";

function pidEv(
  id: string,
  iso: string,
  key: string,
  source?: string
): LifecycleOverviewEvent {
  return {
    eventId: id,
    timestampIso: iso,
    actorSystem: false,
    actorLabel: source === "pid-template-seed" ? "pid-template-seed" : "alice",
    eventAction: "pid_reference_milestone",
    source,
    pidReferenceFields: { milestoneKey: key, lifecyclePhase: "0" },
  };
}

test("timelineJumpToNowEventId picks last past-or-today in order", () => {
  const events: LifecycleOverviewEvent[] = [
    { eventId: "a", timestampIso: "2020-01-01T12:00:00.000Z", actorSystem: true, actorLabel: "", eventAction: "manual_note" },
    { eventId: "b", timestampIso: "2030-01-01T12:00:00.000Z", actorSystem: true, actorLabel: "", eventAction: "manual_note" },
  ];
  assert.equal(timelineJumpToNowEventId(events), "a");
});

test("buildLifecycleOverview marks template_only vs real for same key", () => {
  const events: LifecycleOverviewEvent[] = [
    pidEv("t1", "2020-01-01T12:00:00.000Z", "spec_baseline", "pid-template-seed"),
    pidEv("r1", "2020-06-01T12:00:00.000Z", "spec_baseline", "form"),
  ];
  const { phases } = buildLifecycleOverview(events);
  const p0 = phases.find((p) => p.phase === "0")!;
  const spec = p0.milestones.find((m) => m.key === "spec_baseline")!;
  assert.equal(spec.status, "real");
  assert.equal(spec.latestEventId, "r1");
});

test("lifecycleActorDisplayLabel names template seed without duplicating label · source", () => {
  assert.equal(
    lifecycleActorDisplayLabel({
      actorSystem: false,
      actorLabel: "pid-template-seed",
      source: "pid-template-seed",
    }),
    "Template seed (synthetic spacing)"
  );
  assert.equal(
    lifecycleActorDisplayLabel({
      actorSystem: false,
      actorLabel: "alice",
      source: "form",
    }),
    "alice · form"
  );
  assert.equal(
    lifecycleActorDisplayLabel({
      actorSystem: false,
      actorLabel: "same",
      source: "same",
    }),
    "same"
  );
});

test("lifecycle matrix titles use custom-slot label line, not bimimport: marker", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "slot-1",
    timestampIso: "2026-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "manual_note",
    message:
      "bimimport:deliveriesPidCustomSlot\nphase: 0\nlabel: Bestek baseline\nexpectationId: spec_baseline\n\nNotes here",
  };
  assert.equal(lifecycleMatrixEventTitle(ev), "Bestek baseline");
  assert.equal(lifecycleMatrixEventTitleShort(ev), "Bestek baseline");
});

test("lifecycleMatrixEventTitle uses PID milestone label when key set", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "p1",
    timestampIso: "2026-05-06T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "pid_reference_milestone",
    source: "pid-template-seed",
    pidReferenceFields: { milestoneKey: "pid_opened", lifecyclePhase: "1" },
  };
  assert.equal(lifecycleMatrixEventTitle(ev), "PID process opened");
  assert.equal(lifecycleMatrixEventTitleShort(ev), "PID opened");
});

test("lifecycleMatrixEventTitleShort compacts bestek bindings message", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "b1",
    timestampIso: "2026-04-06T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "bestek_bindings_milestone",
    message:
      "Bestek document opgeslagen — 39 groep(en) data/f01adaf1-a660-46d2-aecd-8ad95505207f-bestek-bindings.json batch c764510b-adf6-48e5-b899-bc06d9aea2a8",
    bestekBindingSaveBatchId: "c764510b-adf6-48e5-b899-bc06d9aea2a8",
  };
  const short = lifecycleMatrixEventTitleShort(ev);
  assert.ok(short.includes("39"));
  assert.ok(short.includes("gr"));
  assert.ok(short.includes("c764510b"));
  assert.ok(!short.includes("data/"));
  assert.ok(!short.includes("bestek-bindings.json"));
});

test("lifecycleMatrixEventIconKind maps document vs milestone vs pipeline", () => {
  const doc: LifecycleOverviewEvent = {
    eventId: "d1",
    timestampIso: "2026-01-01T12:00:00.000Z",
    actorSystem: true,
    actorLabel: "",
    eventAction: "document_reference_logged",
  };
  assert.equal(lifecycleMatrixEventIconKind(doc), "document");
  const pid: LifecycleOverviewEvent = {
    eventId: "p1",
    timestampIso: "2026-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "pid_reference_milestone",
    pidReferenceFields: { milestoneKey: "pid_opened", lifecyclePhase: "1" },
  };
  assert.equal(lifecycleMatrixEventIconKind(pid), "milestone");
  const kb: LifecycleOverviewEvent = {
    eventId: "k1",
    timestampIso: "2026-01-01T12:00:00.000Z",
    actorSystem: true,
    actorLabel: "",
    eventAction: "kb_built",
  };
  assert.equal(lifecycleMatrixEventIconKind(kb), "pipeline");
});

test("eventReferencePhase uses heuristic for deliveries", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "d1",
    timestampIso: "2020-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "bob",
    eventAction: "delivery_document_added",
    source: "deliveries-ingest",
  };
  assert.equal(eventReferencePhase(ev), "2");
});

test("eventReferencePhase buckets structured custom-slot manual_note by phase line", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "n-slot",
    timestampIso: "2020-01-02T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "manual_note",
    message:
      "bimimport:deliveriesPidCustomSlot\nphase: 2\nlabel: Test\nexpectationId: site_report",
  };
  assert.equal(eventReferencePhase(ev), "2");
});

test("product_coupling_updated buckets to phase 2 (checklist alignment)", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "pc1",
    timestampIso: "2020-01-01T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "product_coupling_updated",
  };
  assert.equal(eventReferencePhase(ev), "2");
});

test("compliance_evaluation_recorded buckets to phase 3 (checklist alignment)", () => {
  const ev: LifecycleOverviewEvent = {
    eventId: "ce1",
    timestampIso: "2020-01-03T12:00:00.000Z",
    actorSystem: false,
    actorLabel: "x",
    eventAction: "compliance_evaluation_recorded",
  };
  assert.equal(eventReferencePhase(ev), "3");
});

test("buildLifecycleActorPhaseMatrix places delivery in construction lane × phase 2", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "d1",
      timestampIso: "2020-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "bob",
      eventAction: "delivery_document_added",
      source: "deliveries-ingest",
    },
    {
      eventId: "m1",
      timestampIso: "2020-01-02T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "alice",
      eventAction: "manual_note",
      source: "form",
    },
  ];
  const m = buildLifecycleActorPhaseMatrix(events);
  const conIdx = m.rowLanes.indexOf("construction");
  const archIdx = m.rowLanes.indexOf("architect");
  const boIdx = m.rowLanes.indexOf("bo");
  assert.ok(conIdx >= 0 && archIdx >= 0 && boIdx >= 0);
  const p2Col = m.columnKeys.indexOf("2");
  const unCol = m.columnKeys.indexOf("unassigned");
  assert.equal(m.cells[conIdx]![p2Col]!.events.length, 1);
  assert.equal(m.cells[conIdx]![p2Col]!.events[0]!.eventId, "d1");
  assert.equal(m.cells[boIdx]![unCol]!.events.length, 1);
  assert.equal(m.cells[boIdx]![unCol]!.events[0]!.eventId, "m1");
  assert.equal(m.cells[archIdx]![unCol]!.events.length, 0);
});

test("buildLifecyclePhaseActionMatrix buckets unassigned and counts deliveries in phase 2", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "d1",
      timestampIso: "2020-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "bob",
      eventAction: "delivery_document_added",
      source: "deliveries-ingest",
    },
    {
      eventId: "n1",
      timestampIso: "2020-01-02T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "alice",
      eventAction: "manual_note",
      source: "form",
    },
  ];
  const m = buildLifecyclePhaseActionMatrix(events);
  assert.ok(m.columnActions.includes("delivery_document_added"));
  assert.ok(m.columnActions.includes("manual_note"));
  const unassignedRow = m.rowLabels.length - 1;
  assert.equal(m.rowLabels[unassignedRow]!.phase, "unassigned");
  const delCol = m.columnActions.indexOf("delivery_document_added");
  const noteCol = m.columnActions.indexOf("manual_note");
  const phase2Idx = m.rowLabels.findIndex((r) => r.phase === "2");
  assert.equal(m.grid[phase2Idx]![delCol], 1);
  assert.equal(m.grid[unassignedRow]![noteCol], 1);
});

test("phaseBucketTabForEventId resolves phase bucket for event id", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "e-site",
      timestampIso: "2020-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "x",
      eventAction: "site_report_added",
    },
  ];
  const buckets = groupLifecycleEventsByPhase(events);
  assert.equal(phaseBucketTabForEventId("e-site", buckets), "2");
  assert.equal(phaseBucketTabForEventId("missing", buckets), null);
});

test("groupLifecycleEventsByPhase preserves chronological order within phase", () => {
  const events: LifecycleOverviewEvent[] = [
    {
      eventId: "late",
      timestampIso: "2020-02-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "bob",
      eventAction: "delivery_document_added",
      source: "deliveries-ingest",
    },
    {
      eventId: "early",
      timestampIso: "2020-01-01T12:00:00.000Z",
      actorSystem: false,
      actorLabel: "bob",
      eventAction: "site_report_added",
      source: "form",
    },
  ];
  const { phases, unassigned } = groupLifecycleEventsByPhase(events);
  assert.equal(unassigned.length, 0);
  const p2 = phases.find((p) => p.phase === "2")!;
  assert.equal(p2.events.length, 2);
  assert.equal(p2.events[0]!.eventId, "early");
  assert.equal(p2.events[1]!.eventId, "late");
});
