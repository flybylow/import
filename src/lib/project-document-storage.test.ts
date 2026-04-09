import assert from "node:assert/strict";
import test from "node:test";

import { documentStoredRelPath, safeStoredDocumentFilename } from "./project-document-storage";

test("safeStoredDocumentFilename strips directories and junk", () => {
  assert.equal(safeStoredDocumentFilename("../../etc/passwd"), "passwd");
  assert.equal(safeStoredDocumentFilename("  Factuur 2024!.pdf  "), "Factuur 2024_.pdf");
});

test("documentStoredRelPath joins project, event, filename", () => {
  assert.equal(
    documentStoredRelPath("myproj", "evt-1", "x.pdf"),
    "myproj-documents/evt-1/x.pdf"
  );
});
