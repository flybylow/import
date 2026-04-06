import assert from "node:assert/strict";
import test from "node:test";

import { auditKbStore } from "./kb-provenance-audit";
import { parseKbTtlToStore } from "./kb-store-queries";

const FIXTURE_TTL = `
@prefix bim: <https://tabulas.eu/bim/> .
@prefix ont: <https://tabulas.eu/ontology/> .
@prefix schema: <http://schema.org/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

bim:epd-brick a ont:EPD ;
  schema:name "Stub brick EPD" ;
  ont:epdDataProvenance "dictionary-no-lca-data" .

bim:material-1 schema:name "Red brick" ;
  ont:hasEPD bim:epd-brick ;
  ont:matchType "dictionary_fuzzy+no-lca" ;
  ont:source "dictionary-no-lca" .

bim:material-2 schema:name "Orphan matched" ;
  ont:hasEPD bim:epd-brick ;
  ont:matchType "dictionary_fuzzy+no-lca" ;
  ont:source "dictionary-no-lca" .

bim:element-500 schema:name "Wall" ;
  ont:ifcType "IfcWall" ;
  ont:madeOf bim:material-1 .
`;

test("auditKbStore counts EPDs, links, and orphan matched materials", () => {
  const store = parseKbTtlToStore(FIXTURE_TTL);
  const audit = auditKbStore("fixture", store, FIXTURE_TTL);

  assert.equal(audit.counts.materialsWithEpd, 2);
  assert.equal(audit.counts.materialsWithoutEpd, 0);
  assert.equal(audit.counts.uniqueEpds, 1);
  assert.equal(audit.counts.elementMaterialLinks, 1);
  assert.equal(audit.counts.elementsWithMaterial, 1);

  const brick = audit.epds.find((e) => e.epdSlug === "brick");
  assert.ok(brick);
  assert.equal(brick!.lcaReady, false);
  assert.equal(brick!.hasGwp, false);
  assert.equal(brick!.linkedMaterialCount, 2);

  assert.deepEqual(audit.gaps.materialIdsWithEpdButNoElement, [2]);
  assert.ok(audit.gaps.materialIdsWithEpdMissingGwp.includes(1));
  assert.ok(audit.gaps.materialIdsWithEpdMissingGwp.includes(2));
});
