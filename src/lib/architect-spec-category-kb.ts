import * as $rdf from "rdflib";

import {
  architectCategoryIdForDictionarySlug,
  labelByArchitectCategoryId,
  type ArchitectMaterialTaxonomy,
} from "@/lib/architect-material-taxonomy";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const RDF = $rdf.Namespace(RDF_URI);

/**
 * Links IFC material + EPD resources to `bim:archcat-*` nodes (architect spec vocabulary).
 * Idempotent per category id: first use creates type + label; then adds edges from mat and epd.
 */
export function linkDictionaryMatchToArchitectSpecCategory(
  store: $rdf.Store,
  matNode: $rdf.NamedNode,
  epdNode: $rdf.NamedNode,
  dictionaryEpdSlug: string,
  taxonomy: ArchitectMaterialTaxonomy,
  seenCategoryIds: Set<string>
): void {
  const catId = architectCategoryIdForDictionarySlug(taxonomy, dictionaryEpdSlug);
  if (!catId) return;

  const label = labelByArchitectCategoryId(taxonomy, catId);
  const cat = BIM(`archcat-${catId}`) as unknown as $rdf.NamedNode;

  if (!seenCategoryIds.has(catId)) {
    seenCategoryIds.add(catId);
    store.add(cat, RDF("type"), ONT("ArchitectSpecCategory"));
    store.add(cat, SCHEMA("name"), $rdf.lit(label));
  }

  if (!store.any(matNode, ONT("architectSpecCategory"), cat)) {
    store.add(matNode, ONT("architectSpecCategory"), cat);
  }
  if (!store.any(epdNode, ONT("architectSpecCategory"), cat)) {
    store.add(epdNode, ONT("architectSpecCategory"), cat);
  }
}
