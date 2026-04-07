import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePassportGroupLookupKey,
  resolvePassportGroupKeyFromUrl,
} from "./ifc-passport-type-group";

test("normalizePassportGroupLookupKey canonicalizes bullet separators", () => {
  const canonical = "IfcCovering · plat dak";
  assert.equal(
    normalizePassportGroupLookupKey("IfcCovering \u2219 plat dak"),
    canonical
  );
  assert.equal(
    normalizePassportGroupLookupKey("IfcCovering\u2022plat dak"),
    canonical
  );
  assert.equal(
    normalizePassportGroupLookupKey("IfcCovering  ·  plat dak"),
    canonical
  );
});

test("resolvePassportGroupKeyFromUrl maps URL variant to batch key", () => {
  const keys = ["IfcDoor", "IfcCovering · plat dak", "IfcBeam"] as const;
  assert.equal(
    resolvePassportGroupKeyFromUrl("IfcCovering \u2219 plat dak", keys),
    "IfcCovering · plat dak"
  );
  assert.equal(
    resolvePassportGroupKeyFromUrl("IfcCovering · plat dak", keys),
    "IfcCovering · plat dak"
  );
});

test("resolvePassportGroupKeyFromUrl is case-insensitive for partition", () => {
  const keys = ["IfcCovering · INSULATION"] as const;
  assert.equal(
    resolvePassportGroupKeyFromUrl("IfcCovering · insulation", keys),
    "IfcCovering · INSULATION"
  );
});

test("resolvePassportGroupKeyFromUrl returns null when unknown", () => {
  assert.equal(
    resolvePassportGroupKeyFromUrl("IfcCovering · missing", ["IfcBeam"]),
    null
  );
});
