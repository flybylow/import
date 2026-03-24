import * as $rdf from "rdflib";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";

const ONT = $rdf.Namespace(ONT_URI);

/** Count matched materials by `ont:source` on the material node (KB TTL). */
export function extractMatchedSourceBreakdownFromStore(
  store: $rdf.Store
): Record<string, number> {
  const out: Record<string, number> = {};
  const matchedStmts = store.statementsMatching(null as any, ONT("hasEPD"), null);

  for (const st of matchedStmts) {
    const sourceLit = store.any(st.subject, ONT("source"), null)?.value;
    const key = sourceLit && sourceLit.trim() ? sourceLit.trim() : "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }

  return out;
}

export function extractMatchedSourceBreakdown(kbTtl: string): Record<string, number> {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");
  return extractMatchedSourceBreakdownFromStore(store);
}
