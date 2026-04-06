import * as $rdf from "rdflib";

import { loadArchitectMaterialTaxonomyFromDisk } from "@/lib/architect-material-taxonomy";
import { loadMaterialDictionaryFromDisk } from "@/lib/layer2-translate";
import { nlLabelForDictionaryEntry } from "@/lib/material-label-translations";
import { parseKbTtlToStore } from "@/lib/kb-store-queries";

/** Same as `kb-store-queries` — Turtle uses `bim:` / `ont:` with these bases. */
const ONT_URI = "https://tabulas.eu/ontology/";
const RDF_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA_URI = "http://schema.org/";

const ONT = $rdf.Namespace(ONT_URI);
const RDF = $rdf.Namespace(RDF_URI);
const SCHEMA = $rdf.Namespace(SCHEMA_URI);

export type BestekKbVocabTerm = {
  label: string;
  source:
    | "kb-architect-category"
    | "kb-epd"
    | "kb-material"
    | "taxonomy"
    | "dictionary"
    | "dictionary-nl";
  materialSlug?: string;
  architectCategoryId?: string;
};

function literalValue(store: $rdf.Store, subj: any, pred: any): string | null {
  const lit = store.any(subj, pred, null);
  if (!lit || lit.termType !== "Literal") return null;
  const v = String(lit.value ?? "").trim();
  return v.length ? v : null;
}

function extractFromKbStore(store: $rdf.Store): BestekKbVocabTerm[] {
  const out: BestekKbVocabTerm[] = [];
  const seen = new Set<string>();

  const push = (label: string, term: Omit<BestekKbVocabTerm, "label">) => {
    const L = label.trim();
    if (L.length < 2) return;
    const key = L.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: L, ...term });
  };

  const archStmts = store.statementsMatching(null as any, RDF("type"), ONT("ArchitectSpecCategory"));
  for (const st of archStmts) {
    const subj = st.subject;
    if (subj.termType !== "NamedNode") continue;
    const name = literalValue(store, subj, SCHEMA("name"));
    const m = /archcat-(.+)$/.exec(subj.value);
    const id = m?.[1];
    if (name) push(name, { source: "kb-architect-category", architectCategoryId: id });
  }

  const epdStmts = store.statementsMatching(null as any, RDF("type"), ONT("EPD"));
  for (const st of epdStmts) {
    const subj = st.subject;
    if (subj.termType !== "NamedNode") continue;
    const name = literalValue(store, subj, SCHEMA("name"));
    const um = /epd-(.+)$/.exec(subj.value);
    const slug = um?.[1];
    if (name && slug) push(name, { source: "kb-epd", materialSlug: slug });
  }

  const matStmts = store.statementsMatching(null as any, RDF("type"), ONT("Material"));
  for (const st of matStmts) {
    const subj = st.subject;
    if (subj.termType !== "NamedNode") continue;
    const std = literalValue(store, subj, ONT("standardName"));
    const nm = literalValue(store, subj, SCHEMA("name"));
    const epdTerm = store.any(subj, ONT("hasEPD"), null);
    let slug: string | undefined;
    if (epdTerm && epdTerm.termType === "NamedNode") {
      const em = /epd-(.+)$/.exec(epdTerm.value);
      slug = em?.[1];
    }
    if (std) push(std, { source: "kb-material", materialSlug: slug });
    else if (nm) push(nm, { source: "kb-material", materialSlug: slug });
  }

  return out;
}

function mergeTaxonomyTerms(): BestekKbVocabTerm[] {
  const { taxonomy } = loadArchitectMaterialTaxonomyFromDisk();
  return taxonomy.categories.map((c) => ({
    label: c.label,
    source: "taxonomy" as const,
    architectCategoryId: c.id,
  }));
}

function mergeDictionaryTerms(): BestekKbVocabTerm[] {
  const { entries } = loadMaterialDictionaryFromDisk();
  const out: BestekKbVocabTerm[] = [];
  for (const e of entries) {
    out.push({
      label: e.standardName,
      source: "dictionary",
      materialSlug: e.epdSlug,
    });
    const nl = nlLabelForDictionaryEntry(e.epdSlug, e.standardName);
    const nlt = (nl ?? "").trim();
    if (
      nlt.length >= 2 &&
      nlt.toLowerCase() !== e.standardName.trim().toLowerCase()
    ) {
      out.push({
        label: nlt,
        source: "dictionary-nl",
        materialSlug: e.epdSlug,
      });
    }
  }
  return out;
}

export type BuildBestekKbVocabularyOptions = {
  kbTtl?: string | null;
  maxTerms?: number;
  /** Case-insensitive substring filter (optional). */
  query?: string;
};

/**
 * Labels from static taxonomy + LCA dictionary (aligned with Material column slugs), then
 * project KB (architect categories, materials, EPD names). First source wins per label so
 * dictionary rows keep `materialSlug` when the graph repeats the same wording.
 */
export function buildBestekKbVocabulary(opts: BuildBestekKbVocabularyOptions): BestekKbVocabTerm[] {
  const maxTerms = Math.max(1, Math.min(opts.maxTerms ?? 600, 2000));
  const merged: BestekKbVocabTerm[] = [];
  const seen = new Set<string>();

  const push = (t: BestekKbVocabTerm) => {
    const key = t.label.trim().toLowerCase();
    if (key.length < 2 || seen.has(key)) return;
    seen.add(key);
    merged.push(t);
  };

  for (const t of mergeTaxonomyTerms()) push(t);
  for (const t of mergeDictionaryTerms()) push(t);

  if (opts.kbTtl && opts.kbTtl.trim().length > 0) {
    try {
      const store = parseKbTtlToStore(opts.kbTtl);
      for (const t of extractFromKbStore(store)) push(t);
    } catch {
      // ignore parse errors; taxonomy + dictionary still returned
    }
  }

  merged.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const q = opts.query?.trim().toLowerCase();
  const filtered = q
    ? merged.filter((t) => t.label.toLowerCase().includes(q))
    : merged;

  return filtered.slice(0, maxTerms);
}
