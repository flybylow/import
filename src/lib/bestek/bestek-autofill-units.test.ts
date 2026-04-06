import assert from "node:assert/strict";
import test from "node:test";

import { suggestBestekUnitAndQuantity } from "@/lib/bestek/bestek-autofill-units";

test("Masonry → m², qty = element count placeholder", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcWall",
    elementCount: 12,
    dictionaryCategory: "Masonry",
    epdSlug: "masonry_brick",
  });
  assert.equal(r.unit, "m²");
  assert.equal(r.quantity, "12");
});

test("Concrete beam → m³, qty = element count placeholder", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcBeam",
    elementCount: 4,
    dictionaryCategory: "Concrete",
    epdSlug: "concrete_general",
  });
  assert.equal(r.unit, "m³");
  assert.equal(r.quantity, "4");
});

test("Concrete wall → m², qty placeholder", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcWall",
    elementCount: 8,
    dictionaryCategory: "Concrete",
    epdSlug: "concrete_general",
  });
  assert.equal(r.unit, "m²");
  assert.equal(r.quantity, "8");
});

test("Window → stuks × count", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcWindow",
    elementCount: 16,
    dictionaryCategory: "Metals",
    epdSlug: "aluminium_window_frame",
  });
  assert.equal(r.unit, "stuks");
  assert.equal(r.quantity, "16");
});

test("Zinc work → m², qty placeholder", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcRoof",
    elementCount: 1,
    dictionaryCategory: "Metals",
    epdSlug: "zinc_work",
  });
  assert.equal(r.unit, "m²");
  assert.equal(r.quantity, "1");
});

test("Insulation → m² (boards), qty placeholder", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcCovering",
    elementCount: 40,
    dictionaryCategory: "Insulation",
    epdSlug: "insulation_eps",
    declaredUnit: "kg",
  });
  assert.equal(r.unit, "m²");
  assert.equal(r.quantity, "40");
});

test("Steel railing → stuks", () => {
  const r = suggestBestekUnitAndQuantity({
    ifcType: "IfcRailing",
    elementCount: 9,
    dictionaryCategory: "Metals",
    epdSlug: "steel",
  });
  assert.equal(r.unit, "stuks");
  assert.equal(r.quantity, "9");
});
