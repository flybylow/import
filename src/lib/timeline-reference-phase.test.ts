import assert from "node:assert/strict";
import test from "node:test";

import { defaultSignoffTitleForReferencePhase } from "@/lib/timeline-reference-phase";

test("defaultSignoffTitleForReferencePhase", () => {
  assert.equal(defaultSignoffTitleForReferencePhase(null), "Timeline note");
  assert.equal(defaultSignoffTitleForReferencePhase("2"), "Site / delivery");
});
