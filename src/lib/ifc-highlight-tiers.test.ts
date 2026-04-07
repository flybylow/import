import assert from "node:assert/strict";
import test from "node:test";

import {
  IFC_HIGHLIGHT_TIER_A_MAX,
  IFC_HIGHLIGHT_TIER_B_MAX,
  IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP,
  capExpressIdsForHighlighter,
  effectiveUniformGhostForTier,
  ifcHighlightTierFromFocusCount,
} from "./ifc-highlight-tiers";

test("ifcHighlightTierFromFocusCount boundaries", () => {
  assert.equal(ifcHighlightTierFromFocusCount(0), null);
  assert.equal(ifcHighlightTierFromFocusCount(1), "A");
  assert.equal(ifcHighlightTierFromFocusCount(IFC_HIGHLIGHT_TIER_A_MAX), "A");
  assert.equal(ifcHighlightTierFromFocusCount(IFC_HIGHLIGHT_TIER_A_MAX + 1), "B");
  assert.equal(ifcHighlightTierFromFocusCount(IFC_HIGHLIGHT_TIER_B_MAX), "B");
  assert.equal(ifcHighlightTierFromFocusCount(IFC_HIGHLIGHT_TIER_B_MAX + 1), "C");
});

test("effectiveUniformGhostForTier", () => {
  assert.equal(effectiveUniformGhostForTier(true, null), true);
  assert.equal(effectiveUniformGhostForTier(false, null), false);
  assert.equal(effectiveUniformGhostForTier(true, "A"), true);
  assert.equal(effectiveUniformGhostForTier(false, "A"), false);
  assert.equal(effectiveUniformGhostForTier(true, "B"), false);
  assert.equal(effectiveUniformGhostForTier(true, "C"), false);
});

test("effectiveUniformGhostForTier relaxThroughTierB", () => {
  assert.equal(effectiveUniformGhostForTier(true, "B", true), true);
  assert.equal(effectiveUniformGhostForTier(false, "B", true), false);
  assert.equal(effectiveUniformGhostForTier(true, "C", true), false);
});

test("capExpressIdsForHighlighter A/B pass-through", () => {
  const ids = [1, 2, 3, 10];
  const rA = capExpressIdsForHighlighter(ids, "A");
  assert.deepEqual(rA, { capped: ids, total: 4, truncated: false });
  const rB = capExpressIdsForHighlighter(ids, "B");
  assert.deepEqual(rB, { capped: ids, total: 4, truncated: false });
});

test("capExpressIdsForHighlighter C truncates deterministically", () => {
  const ids = Array.from({ length: 100 }, (_, i) => i + 1);
  const r = capExpressIdsForHighlighter(ids, "C");
  assert.equal(r.total, 100);
  assert.equal(r.truncated, true);
  assert.equal(r.capped.length, IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP);
  assert.deepEqual(r.capped, ids.slice(0, IFC_HIGHLIGHT_TIER_C_HIGHLIGHT_CAP));
});

test("capExpressIdsForHighlighter C no truncate when under cap", () => {
  const ids = [1, 2, 3];
  const r = capExpressIdsForHighlighter(ids, "C");
  assert.equal(r.truncated, false);
  assert.deepEqual(r.capped, ids);
});
