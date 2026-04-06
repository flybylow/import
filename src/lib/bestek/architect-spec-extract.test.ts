import assert from "node:assert/strict";
import test from "node:test";

import {
  extractArticleTokenCandidates,
  extractCategoryHintsFromText,
} from "@/lib/bestek/architect-spec-extract";

test("extractArticleTokenCandidates finds dotted numbers", () => {
  const t = "10.1 — gevel\nZie ook art 12.3.2 en 5.0";
  assert.deepEqual(extractArticleTokenCandidates(t), ["10.1", "12.3.2", "5.0"]);
});

test("extractCategoryHintsFromText matches dictionary category names", () => {
  const text = "Metselwerk in baksteen volgens Masonry specs";
  const hints = extractCategoryHintsFromText(text, ["Masonry", "Concrete", "Glass"]);
  assert.ok(hints.includes("Masonry"));
  assert.ok(!hints.includes("Concrete"));
});
