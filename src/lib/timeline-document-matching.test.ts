import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTimelineDocumentMatchesUseVocabulary,
  matchForTimelineDocumentKind,
  TIMELINE_DOCUMENT_MATCHES,
} from "./timeline-document-matching";

test("timeline-document-matching keeps vocabulary in sync with timeline-events-vocab", () => {
  assert.doesNotThrow(() => assertTimelineDocumentMatchesUseVocabulary());
});

test("leveringsbon and werfverslag map to distinct timeline actions", () => {
  assert.equal(matchForTimelineDocumentKind("leveringsbon")?.eventAction, "delivery_document_added");
  assert.equal(matchForTimelineDocumentKind("werfverslag")?.eventAction, "site_report_added");
});

test("TIMELINE_DOCUMENT_MATCHES has unique kinds", () => {
  const kinds = TIMELINE_DOCUMENT_MATCHES.map((m) => m.kind);
  assert.equal(new Set(kinds).size, kinds.length);
});
