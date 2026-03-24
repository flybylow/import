import * as $rdf from "rdflib";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";
const SCHEMA_URI = "http://schema.org/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const BIM = $rdf.Namespace(BIM_URI);
const ONT = $rdf.Namespace(ONT_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);
const RDF = $rdf.Namespace(RDF_URI);

/** Slug for Option A: synthetic EPD used for hatch / filler — not from KBOB/ICE, not calculable. */
export const FILLER_NO_EPD_SLUG = "filler_noEPD";

/** Stored on `ont:epdDataProvenance` — must be in {@link PLACEHOLDER_EPD_PROVENANCE} in `kb-read-epd.ts`. */
export const FILLER_NO_EPD_PROVENANCE = "filler-no-epd";

const FILLER_DISPLAY_NAME =
  "Filler / no EPD (hatch, annotation — not calculable)";

/**
 * Ensures `bim:epd-filler_noEPD` exists: routing marker only, no GWP/LCA data.
 * Idempotent if the node already exists.
 */
export function ensureFillerNoEpdStub(store: $rdf.Store): void {
  const epd = BIM(`epd-${FILLER_NO_EPD_SLUG}`) as $rdf.NamedNode;
  const typeStmt = store.any(epd, RDF("type"), ONT("EPD"));
  if (typeStmt) return;

  store.add(epd, RDF("type"), ONT("EPD"));
  store.add(epd, SCHEMA("name"), $rdf.lit(FILLER_DISPLAY_NAME));
  store.add(epd, ONT("epdDataProvenance"), $rdf.lit(FILLER_NO_EPD_PROVENANCE));
}
