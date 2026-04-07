import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultMaterialSlugForIfcType,
  suggestedMaterialSlugForBestekGroup,
} from "./ifc-type-material-defaults";

test("IfcWall ignores partition", () => {
  assert.equal(
    suggestedMaterialSlugForBestekGroup("IfcWall", "gipsplafond"),
    "masonry_brick"
  );
});

test("IfcCovering partition drives slug for Schependomlaan-style labels", () => {
  assert.equal(
    suggestedMaterialSlugForBestekGroup("IfcCovering", "gipsplafond"),
    "gypsum_plaster"
  );
  assert.equal(
    suggestedMaterialSlugForBestekGroup("IfcCovering", "gevelisolatie"),
    "insulation_generic"
  );
  assert.equal(
    suggestedMaterialSlugForBestekGroup("IfcCovering", "dakisolatie"),
    "insulation_generic"
  );
  assert.equal(
    suggestedMaterialSlugForBestekGroup("IfcCovering", "dakpan (vlak)"),
    "ceramic_tile"
  );
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "dakschroot"), "timber");
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "dakopstand"), "zinc_work");
});

test("IfcCovering predefined type strings", () => {
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "INSULATION"), "insulation_generic");
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "CEILING"), "gypsum_plaster");
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "ROOFING"), "");
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", "FLOORING"), "");
});

test("IfcCovering empty partition — no blanket ceramic default", () => {
  assert.equal(suggestedMaterialSlugForBestekGroup("IfcCovering", ""), "");
  assert.equal(defaultMaterialSlugForIfcType("IfcCovering"), "");
});
