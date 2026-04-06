import materialLabelTranslations from "@/data/material-label-translations.json";
import {
  findDictionaryCategoryForSlug,
  suggestBestekUnitAndQuantity,
} from "@/lib/bestek/bestek-autofill-units";
import { defaultMaterialSlugForIfcType } from "@/lib/bestek/ifc-type-material-defaults";

export type BestekAutofillCatalogEntry = {
  epdSlug: string;
  standardName: string;
  declaredUnit?: string;
};

export type BestekAutofillCatalog = {
  category: string;
  entries: BestekAutofillCatalogEntry[];
}[];

function findCatalogEntry(
  catalog: BestekAutofillCatalog,
  epdSlug: string
): BestekAutofillCatalogEntry | undefined {
  const s = epdSlug.trim();
  if (!s) return undefined;
  for (const cat of catalog) {
    const hit = cat.entries.find((e) => e.epdSlug === s);
    if (hit) return hit;
  }
  return undefined;
}

/** Client-safe NL label (same rules as `nlLabelForDictionaryEntry`, no fs). */
function nlLabelForSlugAndStandardName(slug: string, standardName: string): string | undefined {
  const rows = materialLabelTranslations.translations;
  const candidates = rows.filter((t) => t.epdSlug.trim() === slug.trim());
  if (candidates.length === 0) return undefined;
  const std = standardName.trim();
  const withStd = candidates.filter((t) => (t.standardNameEn ?? "").trim());
  if (withStd.length > 0) {
    const hit = withStd.find((t) => (t.standardNameEn ?? "").trim() === std);
    return hit?.nl.trim() || undefined;
  }
  if (candidates.length === 1) return candidates[0].nl.trim() || undefined;
  const byEn = candidates.find((t) => (t.en ?? "").trim() === std);
  return byEn?.nl.trim() || undefined;
}

export type BestekAutofillRowInput = {
  group_id: string;
  ifc_type: string;
  element_count: number;
};

export type BestekAutofillDraft = {
  architect_name: string;
  material_slug: string;
  article_number: string;
  article_unit: string;
  article_quantity: string;
  or_equivalent: boolean;
};

/**
 * Suggested row for Deliveries → Bestek: IFC default slug, NL architect wording when available,
 * sequential Art.#, unit/qty from dictionary declared unit + IFC heuristics.
 */
export function computeBestekAutofillDraft(
  group: BestekAutofillRowInput,
  articleIndex: number,
  catalog: BestekAutofillCatalog,
  currentMaterialSlug: string
): BestekAutofillDraft {
  const slug =
    currentMaterialSlug.trim() || defaultMaterialSlugForIfcType(group.ifc_type);
  const entry = slug ? findCatalogEntry(catalog, slug) : undefined;
  const standardName = entry?.standardName ?? "";
  const architect_name =
    (slug && standardName ? nlLabelForSlugAndStandardName(slug, standardName) : undefined) ||
    standardName ||
    group.ifc_type;
  const dictionaryCategory = slug
    ? findDictionaryCategoryForSlug(catalog, slug)
    : undefined;
  const { unit, quantity } = suggestBestekUnitAndQuantity({
    ifcType: group.ifc_type,
    elementCount: group.element_count,
    declaredUnit: entry?.declaredUnit,
    dictionaryCategory,
    epdSlug: slug,
  });
  return {
    architect_name,
    material_slug: slug,
    article_number: String(articleIndex + 1),
    article_unit: unit,
    article_quantity: quantity,
    or_equivalent: true,
  };
}
