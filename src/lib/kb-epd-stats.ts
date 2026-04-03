import * as $rdf from "rdflib";

const BIM_URI = "https://tabulas.eu/bim/";
const ONT_URI = "https://tabulas.eu/ontology/";

const ONT = $rdf.Namespace(ONT_URI);

function breakdownKeyFromDatasetLiteral(raw: string): string {
  // Prefer the dataset literal as-is (e.g. `b-epd-be`, `kbob`).
  // Keep legacy `*-source` keys stable by stripping the suffix.
  const s = raw.trim();
  if (!s) return "unknown";
  return s.endsWith("-source") ? s.slice(0, -"-source".length) : s;
}

/**
 * Same bucket key as {@link extractMatchedSourceBreakdownFromStore} for one
 * `bim:material-*` → EPD edge (used by APIs that list materials per bucket).
 */
export function materialMatchedSourceKey(
  store: $rdf.Store,
  mat: unknown,
  epd: unknown
): string {
  const matchType =
    store.any(mat as any, ONT("matchType"), null)?.value?.trim() ?? "";
  const matSrc =
    store.any(mat as any, ONT("source"), null)?.value?.trim() ?? "unknown";

  if (matchType.includes("+no-lca")) {
    return matSrc;
  }
  const epdT = epd as { termType?: string };
  if (epdT.termType === "NamedNode" || epdT.termType === "BlankNode") {
    const epdSrc = store.any(epd as any, ONT("source"), null)?.value?.trim();
    return epdSrc ? breakdownKeyFromDatasetLiteral(epdSrc) : matSrc;
  }
  return matSrc;
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
    const key = materialMatchedSourceKey(store, mat, epd);
    out[key] = (out[key] ?? 0) + 1;
  }

  return out;
}

export function extractMatchedSourceBreakdown(kbTtl: string): Record<string, number> {
  const store = $rdf.graph();
  $rdf.parse(kbTtl, store, BIM_URI, "text/turtle");
  return extractMatchedSourceBreakdownFromStore(store);
}
