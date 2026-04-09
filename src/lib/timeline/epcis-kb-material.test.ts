import test from "node:test";
import assert from "node:assert/strict";

import { epcisToTimelinePayload, validateEPCIS } from "@/lib/timeline/epcis";
import type { EPCISEvent } from "@/lib/timeline/types";

const base: EPCISEvent = {
  type: "ObjectEvent",
  eventTime: "2026-04-04T12:00:00.000Z",
  eventID: "urn:uuid:aed0c443-7be2-4b64-8fd6-972ca76ef2c2",
  bizStep: "shipping",
  epcList: ["urn:epc:id:sgtin:7547845584.887.100"],
};

test("validateEPCIS rejects bad kbMaterialId", () => {
  const v = validateEPCIS({ ...base, kbMaterialId: -1 });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes("kbMaterialId")));
});

test("epcisToTimelinePayload: kbMaterialId sets materialReference for timeline linking", () => {
  const { payload } = epcisToTimelinePayload({ ...base, kbMaterialId: 17496 }, "evt-1");
  assert.equal(payload.materialReference, "17496");
});

test("epcisToTimelinePayload: without kbMaterialId uses epcList[0]", () => {
  const { payload } = epcisToTimelinePayload(base, "evt-2");
  assert.equal(payload.materialReference, "urn:epc:id:sgtin:7547845584.887.100");
});
