/**
 * Shared normalization for dictionary + source (KBOB/ICE) matching.
 * Maps common NL/BE IFC layer names to English tokens that appear in source `matchText`.
 * Keep in sync with any consumer that scores IFC text against source graphs.
 */
export function normMaterialLabelForMatch(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Drop CAD hatch/fill tokens so matching sees physical materials (also helps older TTL)
    .replace(/\bhatching\d*\b/g, " ")
    .replace(/\b(lege|dichte|leeg)\s+arcering\b/g, " ")
    .replace(/\bddichte\s+arcering\b/g, " ")
    .replace(/\b\d{3}\s+\d{2}\s*%\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(r c|rc)\b/g, " reinforced concrete ")
    .replace(/\bgewapend(e)?\b/g, " reinforced ")
    .replace(/\bbeton\b/g, " concrete ")
    .replace(/\bstaal\b/g, " steel ")
    // NL laminated / structural wood (Revit lists); not matched by bare `hout`
    .replace(/\bloofhout\b/g, " timber ")
    .replace(/\bhout\b/g, " timber ")
    // Dutch / French insulation → ICE uses "Insulation" in matchText
    .replace(/\bspouwisolatie\b/g, " insulation ")
    .replace(/\bgevelisolatie\b/g, " insulation ")
    .replace(/\bdakisolatie\b/g, " insulation ")
    .replace(/\bisolatie\b/g, " insulation ")
    .replace(/\bisolation\b/g, " insulation ")
    .replace(/\bglaswol\b/g, " glass wool ")
    .replace(/\bglas wol\b/g, " glass wool ")
    // Outer leaf / cavity wall leaf → often brick / block (ICE Bricks section)
    .replace(/\bbuitenblad\b/g, " brick masonry outer leaf ")
    // Timber frame (NL Houtskeletbouw)
    .replace(/\bhsb-element\b/g, " timber frame panel ")
    .replace(/\bhsb\b/g, " timber frame ")
    // Foundations (common IFC naming)
    .replace(/\bfund_strook\b/g, " foundation concrete strip ")
    .replace(/\bfund_opstort\b/g, " foundation concrete blinding ")
    .replace(/\bopstort\b/g, " concrete blinding ")
    .replace(/\bstrookfundering\b/g, " foundation concrete strip ")
    // Roof elements
    .replace(/\bdakopstand\b/g, " concrete roof coping ")
    .replace(/\bdakkoepel\b/g, " roof skylight dome ")
    .replace(/\bdakkapel\b/g, " timber roof dormer ")
    .replace(/\bzijwang\b/g, " dormer side wall timber ")
    // Joinery → aluminium profiles in ICE
    .replace(/\bkozijn\b/g, " aluminium window frame ")
    .replace(/\bprofiel\b/g, " aluminium profile ")
    // Concrete paving tiles
    .replace(/\bbetontegels\b/g, " concrete paving tiles ")
    .replace(/\bbreedplaat\b/g, " precast concrete wide slab facade ")
    .replace(/\bkanaalplaat\b/g, " hollow core concrete slab ")
    .replace(/\bdekvloer\b/g, " screed floor ")
    .replace(/\bcementdekvloer\b/g, " cement screed ")
    .replace(/\bkeramisch\b/g, " ceramic tile ")
    .replace(/\bwandtegels?\b/g, " wall tile ceramic ")
    .replace(/\bvloertegels?\b/g, " floor tile ceramic ")
    .replace(/\bverlaagd plafond\b/g, " gypsum plasterboard ceiling suspended ")
    .replace(/\bscheidingswand\b/g, " gypsum partition wall ")
    .replace(/\blichte scheidingswand\b/g, " gypsum partition wall light ")
    .replace(/\bbrandwering\b/g, " fire protection gypsum board ")
    .replace(/\bpromatect\b/g, " fire protection calcium silicate board ")
    .replace(/\bschoonloopmat\b/g, " entrance walk off mat ")
    .replace(/\blucht frame\b/g, " ventilation metal frame ")
    .replace(/\bplatsica\b/g, " plastic sheet ")
    .replace(/\bplaatmateriaal\b/g, " sheet material ")
    .replace(/\bnatuursteen\b/g, " natural stone ")
    .replace(/\bgipsplafond\b/g, " gypsum plasterboard ceiling ")
    .replace(/\bgipsblokken\b/g, " gypsum blocks ")
    // "Gipsplaat" / IFC gypsum board — must run before bare `gips` (substring of gipsplaat)
    .replace(/\bgipsplaat\b/g, " gypsum plasterboard ")
    .replace(/\bgipsvezelplaat\b/g, " gypsum fiberboard ")
    .replace(/\bgips\b/g, " gypsum plaster ")
    .replace(/\bglas hekwerk\b/g, " glass railing ")
    .replace(/\bmetaal aluminium\b/g, " aluminium metal ")
    // Masonry / sand-lime brick (NL) → DE/EN tokens in KBOB matchText ("Kalksandstein", …)
    .replace(/\bmetselwerk\b/g, " masonry brickwork ")
    .replace(/\bkalkzandsteen\b/g, " kalksandstein calcium silicate brick ")
    // German product labels in KBOB matchText (helps substring overlap)
    .replace(/\bhochbaubeton\b/g, " concrete ")
    .replace(/\bmagerbeton\b/g, " concrete ")
    .replace(/\bortbeton\b/g, " concrete ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Same string Phase 2 uses for dictionary + source overlap — join IFC labels, then
 * {@link normMaterialLabelForMatch} once.
 */
export function combinedNormalizedMaterialLabel(args: {
  schemaName?: string;
  layerSetName?: string;
}): string {
  return normMaterialLabelForMatch(
    `${args.schemaName ?? ""} ${args.layerSetName ?? ""}`
  );
}
