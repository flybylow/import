import * as $rdf from "rdflib";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";

const ONT = $rdf.Namespace(ONT_URI);

function breakdownKeyFromDatasetLiteral(raw: string): string {
  const s = raw.trim();
  if (!s) return "unknown";
  if (s.endsWith("-source")) return s;
  return `${s}-source`;
}

/**
 * Count matched materials by **LCA dataset** when available: follow `ont:hasEPD`
 * to the EPD node and use `ont:source` there (`ont:sourceDataset` copied at
 * import — e.g. `b-epd-be`, `kbob`). Falls back to `ont:source` on the material
 * (`dictionary-routed`, `kbob-source`, …).
 */
export function extractMatchedSourceBreakdownFromStore(
  store: $rdf.Store
): Record<string, number> {
  const out: Record<string, number> = {};
  const matchedStmts = store.statementsMatching(null as any, ONT("hasEPD"), null);

  for (const st of matchedStmts) {
    const mat = st.subject;
    const epd = st.object;

    const matchType =
      store.any(mat, ONT("matchType"), null)?.value?.trim() ?? "";
    const matSrc =
      store.any(mat, ONT("source"), null)?.value?.trim() ?? "unknown";

    let key: string;
    if (matchType.includes("+no-lca")) {
      key = matSrc;
    } else if (epd.termType === "NamedNode" || epd.termType === "BlankNode") {
      const epdSrc = store.any(epd as any, ONT("source"), null)?.value?.trim();
      key = epdSrc ? breakdownKeyFromDatasetLiteral(epdSrc) : matSrc;
    } else {
      key = matSrc;
    }

    out[key] = (out[key] ?? 0) + 1;
  }

  return out;
}

export function extractMatchedSourceBreakdown(kbTtl: string): Record<string, number> {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");
  return extractMatchedSourceBreakdownFromStore(store);
}
