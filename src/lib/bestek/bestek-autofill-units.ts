/**
 * Bestek / opmetingsstaat units aligned with typical Flemish architect specs
 * (category × application). Discrete openings → `stuks`; areas → m²; volumes → m³; steel mass → kg.
 */

export function findDictionaryCategoryForSlug(
  catalog: { category: string; entries: { epdSlug: string }[] }[],
  epdSlug: string
): string | undefined {
  const s = epdSlug.trim();
  if (!s) return undefined;
  for (const cat of catalog) {
    if (cat.entries.some((e) => e.epdSlug === s)) return cat.category;
  }
  return undefined;
}

const CONCRETE_VOLUME_IFC =
  /^(IfcBeam|IfcColumn|IfcSlab|IfcStair|IfcFooting|IfcPile)$/i;

/** Openings / countable frames / loose accessories — spec: stuks where the architect counts pieces. */
const DISCRETE_STUKS_IFC =
  /^(IfcDoor|IfcWindow|IfcFlowTerminal|IfcDiscreteAccessory)$/i;

/** Linear / piece metal often counted per piece in bestek. */
const METAL_PIECE_IFC =
  /^(IfcMember|IfcPlate|IfcRailing|IfcBuildingElementPart|IfcBuildingElementProxy)$/i;

function declaredUnitHint(duRaw: string | undefined): "m2" | "m3" | "kg" | null {
  const du = (duRaw ?? "").toLowerCase().replace(/\s+/g, " ");
  if (!du) return null;
  if (/\b(kg|ton)\b/.test(du) || du.includes("kilogram")) return "kg";
  if (/\bm(3|³)\b/.test(du) || /\b1\s*m3\b/.test(du)) return "m3";
  if (/\bm(2|²)\b/.test(du) || /\b1\s*m2\b/.test(du)) return "m2";
  return null;
}

export type BestekAutofillUnitInput = {
  ifcType: string;
  elementCount: number;
  declaredUnit?: string;
  dictionaryCategory?: string;
  epdSlug: string;
};

/**
 * When the architect unit is m² / m³ / kg we still need a non-empty quantity to save bindings.
 * Uses **element count in the IFC group** as a **reference placeholder** (not measured geometry).
 * Replace with real opmeting when available.
 */
function ensureSubmittableQuantity(
  unit: string,
  quantity: string,
  elementCount: number
): { unit: string; quantity: string } {
  const q = quantity.trim();
  if (q.length > 0) return { unit, quantity: q };
  const n = Math.max(0, Math.floor(Number(elementCount)));
  return { unit, quantity: Number.isFinite(n) ? String(n) : "0" };
}

function suggestBestekUnitAndQuantityCore(input: BestekAutofillUnitInput): {
  unit: string;
  quantity: string;
} {
  const { ifcType, elementCount, declaredUnit, dictionaryCategory, epdSlug } = input;
  const ifc = ifcType.trim();
  const slug = epdSlug.trim();
  const cat = (dictionaryCategory ?? "").trim();
  const du = declaredUnitHint(declaredUnit);

  // 1) Openings — Aluminium / Hout windows & doors: stuks
  if (DISCRETE_STUKS_IFC.test(ifc)) {
    return { unit: "stuks", quantity: String(elementCount) };
  }

  // 2) Zinkwerk — roofing/cladding: m²
  if (slug === "zinc_work") {
    return { unit: "m²", quantity: "" };
  }

  // 3) Masonry — Metselwerk walls/facades: m²
  if (cat === "Masonry") {
    return { unit: "m²", quantity: "" };
  }

  // 4) Concrete — Beton: beams/slabs/floors m³ or m²; walls m²
  if (cat === "Concrete") {
    if (CONCRETE_VOLUME_IFC.test(ifc)) {
      if (du === "m2") return { unit: "m²", quantity: "" };
      return { unit: "m³", quantity: "" };
    }
    if (du === "m3") return { unit: "m³", quantity: "" };
    return { unit: "m²", quantity: "" };
  }

  // 5) Timber — Hout: roofs/sheathing m²; doors already handled
  if (cat === "Timber") {
    if (du === "m3") return { unit: "m³", quantity: "" };
    return { unit: "m²", quantity: "" };
  }

  // 6) Metals — Staal kg or stuks; Aluminium windows stuks (above) or m²
  if (cat === "Metals") {
    if (slug === "aluminium_window_frame" && !DISCRETE_STUKS_IFC.test(ifc)) {
      return { unit: "m²", quantity: "" };
    }
    if (slug === "steel" || slug === "aluminium_window_frame") {
      if (METAL_PIECE_IFC.test(ifc) || /^IfcColumn$/i.test(ifc)) {
        return { unit: "stuks", quantity: String(elementCount) };
      }
      if (slug === "steel" && du === "kg") {
        return { unit: "kg", quantity: "" };
      }
      if (slug === "steel") {
        return { unit: "kg", quantity: "" };
      }
    }
    if (METAL_PIECE_IFC.test(ifc)) {
      return { unit: "stuks", quantity: String(elementCount) };
    }
    return { unit: "kg", quantity: "" };
  }

  // 7) Glazing — Glas: m² or stuks; windows already stuks
  if (cat === "Glazing") {
    if (METAL_PIECE_IFC.test(ifc) || /^IfcRailing$/i.test(ifc)) {
      return { unit: "m²", quantity: "" };
    }
    return { unit: "m²", quantity: "" };
  }

  // 8) Finishes — Keramiek, Gips, Mortel/screed, Natuursteen
  if (cat === "Finishes") {
    if (slug === "screed_floor") {
      if (du === "m3") return { unit: "m³", quantity: "" };
      return { unit: "m²", quantity: "" };
    }
    return { unit: "m²", quantity: "" };
  }

  // 9) Insulation — m² or m³ (layers vs volume); default m² for board-style EPDs
  if (cat === "Insulation") {
    if (du === "m3") return { unit: "m³", quantity: "" };
    return { unit: "m²", quantity: "" };
  }

  // 10) Polymers — Kunststof sheets: m²
  if (cat === "Polymers") {
    return { unit: "m²", quantity: "" };
  }

  // 11) Declared unit fallback when category unknown
  if (du === "kg") return { unit: "kg", quantity: "" };
  if (du === "m3") return { unit: "m³", quantity: "" };
  if (du === "m2") return { unit: "m²", quantity: "" };

  // 12) Last resort: countable proxy parts
  if (METAL_PIECE_IFC.test(ifc)) {
    return { unit: "stuks", quantity: String(elementCount) };
  }

  return { unit: "m²", quantity: "" };
}

/**
 * Returns display unit (m², m³, kg, stuks) and quantity string.
 * `stuks` uses element count as real quantity. For m²/m³/kg, when geometry is unknown, quantity defaults
 * to **element count** so rows stay submittable — treat as reference until replaced with measured values.
 */
export function suggestBestekUnitAndQuantity(input: BestekAutofillUnitInput): {
  unit: string;
  quantity: string;
} {
  const r = suggestBestekUnitAndQuantityCore(input);
  return ensureSubmittableQuantity(r.unit, r.quantity, input.elementCount);
}
