import * as $rdf from "rdflib";

export type DiffPreview = {
  addedCount: number;
  removedCount: number;
  addedPreview: string[];
  removedPreview: string[];
};

function litRepr(lit: $rdf.Literal) {
  // rdflib Literal: { value, datatype, lang }
  const dt = (lit.datatype && lit.datatype.value) || "";
  const lang = lit.lang || "";
  // Keep it deterministic; datatype+lang separated.
  return `LIT|${lit.value}|${dt}|${lang}`;
}

function tripleKey(st: $rdf.Statement) {
  const s = st.subject.value;
  const p = st.predicate.value;
  const o = st.object;
  const oRepr =
    o.termType === "Literal" ? litRepr(o as $rdf.Literal) : `TERM|${o.value}`;
  return `${s}|${p}|${oRepr}`;
}

function formatTermForNTriples(term: any) {
  if (term.termType === "Literal") {
    const lit = term as $rdf.Literal;
    const escaped = lit.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    if (lit.lang) return `"${escaped}"@${lit.lang}`;
    if (lit.datatype && lit.datatype.value)
      return `"${escaped}"^^<${lit.datatype.value}>`;
    return `"${escaped}"`;
  }
  if (term.termType === "NamedNode" || term.termType === "BlankNode") {
    return term.termType === "NamedNode" ? `<${term.value}>` : `_:${term.value}`;
  }
  return `<${term.value}>`;
}

function formatStatementNTriples(st: $rdf.Statement) {
  const s = formatTermForNTriples(st.subject);
  const p = formatTermForNTriples(st.predicate);
  const o = formatTermForNTriples(st.object);
  return `${s} ${p} ${o} .`;
}

export function computeTripleDiff(args: {
  oldTtl: string;
  newTtl: string;
  previewMax?: number;
}): DiffPreview {
  const { oldTtl, newTtl, previewMax = 60 } = args;

  const BASE_IRI = "https://tabulas.eu/bim/";

  const storeOld = $rdf.graph();
  const storeNew = $rdf.graph();

  // Parse without relying on prefixes; rdflib will still read absolute URIs.
  $rdf.parse(oldTtl, storeOld, BASE_IRI, "text/turtle");
  $rdf.parse(newTtl, storeNew, BASE_IRI, "text/turtle");

  const oldSet = new Set<string>();
  for (const st of storeOld.statements) oldSet.add(tripleKey(st));

  const newSet = new Set<string>();
  for (const st of storeNew.statements) newSet.add(tripleKey(st));

  const addedKeys: string[] = [];
  const removedKeys: string[] = [];

  for (const k of newSet) if (!oldSet.has(k)) addedKeys.push(k);
  for (const k of oldSet) if (!newSet.has(k)) removedKeys.push(k);

  addedKeys.sort();
  removedKeys.sort();

  const addedPreview: string[] = [];
  const removedPreview: string[] = [];

  if (previewMax > 0) {
    // Build previews by formatting statements found in the new/old stores.
    const addedSet = new Set<string>(addedKeys.slice(0, previewMax));
    for (const st of storeNew.statements) {
      const k = tripleKey(st);
      if (addedSet.has(k)) addedPreview.push(formatStatementNTriples(st));
      if (addedPreview.length >= previewMax) break;
    }

    const removedSet = new Set<string>(removedKeys.slice(0, previewMax));
    for (const st of storeOld.statements) {
      const k = tripleKey(st);
      if (removedSet.has(k)) removedPreview.push(formatStatementNTriples(st));
      if (removedPreview.length >= previewMax) break;
    }
  }

  return {
    addedCount: addedKeys.length,
    removedCount: removedKeys.length,
    addedPreview,
    removedPreview,
  };
}

