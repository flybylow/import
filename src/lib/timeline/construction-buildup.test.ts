import test from "node:test";
import assert from "node:assert/strict";

import type { Phase4ElementPassport } from "@/lib/phase4-passports";
import {
  parseKbMaterialIdFromReference,
  resolveKbMaterialIdFromMaterialReference,
} from "@/lib/timeline/construction-buildup";

const fakePassport = (materialId: number): Phase4ElementPassport[] => [
  {
    elementId: 1,
    expressId: 10,
    materials: [
      {
        materialId,
        materialName: "Test layer",
        hasEPD: true,
        epdSlug: "insulation_generic",
      },
    ],
    ifcQuantities: [],
  },
];

test("parseKbMaterialIdFromReference: plain id and bim:material-", () => {
  assert.equal(parseKbMaterialIdFromReference("17496"), 17496);
  assert.equal(parseKbMaterialIdFromReference("bim:material-17496"), 17496);
  assert.equal(parseKbMaterialIdFromReference("https://x/dpp/material/17496"), 17496);
  assert.equal(parseKbMaterialIdFromReference(undefined), undefined);
  assert.equal(parseKbMaterialIdFromReference("urn:epc:id:sgtin:x"), undefined);
});

test("resolveKbMaterialIdFromMaterialReference: numeric when present in passports", () => {
  const list = fakePassport(17496);
  assert.equal(resolveKbMaterialIdFromMaterialReference("17496", list), 17496);
  assert.equal(resolveKbMaterialIdFromMaterialReference("bim:material-17496", list), 17496);
});

test("resolveKbMaterialIdFromMaterialReference: unknown numeric id returns slug path", () => {
  const list = fakePassport(99);
  assert.equal(resolveKbMaterialIdFromMaterialReference("17496", list), undefined);
});
