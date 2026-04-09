import assert from "node:assert/strict";
import test from "node:test";

import {
  deliveriesIngestLivePreviewOpen,
  deliveriesOpenSavedSpecificationFiche,
  deliveriesTabFromQueryParam,
} from "./deliveries-tabs";

test("deliveriesTabFromQueryParam canonical + aliases", () => {
  assert.equal(deliveriesTabFromQueryParam(null), "specification");
  assert.equal(deliveriesTabFromQueryParam(""), "specification");
  assert.equal(deliveriesTabFromQueryParam("unknown"), "ingest");
  assert.equal(deliveriesTabFromQueryParam("ingest"), "ingest");
  assert.equal(deliveriesTabFromQueryParam("flow"), "ingest");
  assert.equal(deliveriesTabFromQueryParam("leveringsbon"), "ingest");
  assert.equal(deliveriesTabFromQueryParam("werf"), "ingest");
  assert.equal(deliveriesTabFromQueryParam("specification"), "specification");
  assert.equal(deliveriesTabFromQueryParam("bestek"), "specification");
  assert.equal(deliveriesTabFromQueryParam("spec"), "specification");
  assert.equal(deliveriesTabFromQueryParam("pid"), "pid");
  assert.equal(deliveriesTabFromQueryParam("lifecycle"), "pid");
});

test("deliveriesOpenSavedSpecificationFiche", () => {
  const a = { get: (k: string) => (k === "specificationFiche" ? "1" : null) };
  assert.equal(deliveriesOpenSavedSpecificationFiche(a), true);
  const b = { get: (k: string) => (k === "bestekFiche" ? "1" : null) };
  assert.equal(deliveriesOpenSavedSpecificationFiche(b), true);
  const c = { get: () => null };
  assert.equal(deliveriesOpenSavedSpecificationFiche(c), false);
});

test("deliveriesIngestLivePreviewOpen", () => {
  assert.equal(
    deliveriesIngestLivePreviewOpen({ get: (k) => (k === "ingestPreview" ? "1" : null) }),
    true
  );
  assert.equal(deliveriesIngestLivePreviewOpen({ get: () => null }), false);
  assert.equal(
    deliveriesIngestLivePreviewOpen({ get: (k) => (k === "ingestPreview" ? "0" : null) }),
    false
  );
});
