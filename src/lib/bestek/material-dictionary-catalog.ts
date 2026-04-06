import { loadMaterialDictionaryFromDisk } from "@/lib/layer2-translate";
import { normMaterialLabelForMatch } from "@/lib/material-norm";

export type CatalogEntry = {
  epdSlug: string;
  standardName: string;
  category: string;
  subcategory?: string;
  epdSource: string;
  /** Dictionary `declaredUnit` (e.g. `1 m3`, `kg`) — hints for Bestek unit autofill. */
  declaredUnit?: string;
  gwpKgCo2ePerTonne?: number;
};

export type CatalogCategory = {
  category: string;
  entries: CatalogEntry[];
};

/** Group `material-dictionary.json` rows for `<optgroup>` UI (Deliveries → Bestek Dictionary). */
export function materialDictionaryCatalog(): {
  version?: string;
  categories: CatalogCategory[];
} {
  const { version, entries } = loadMaterialDictionaryFromDisk();
  const byCat = new Map<string, typeof entries>();
  for (const e of entries) {
    const c = (e.category ?? "").trim() || "Other";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(e);
  }
  const categories: CatalogCategory[] = [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      entries: [...list]
        .sort((x, y) => x.standardName.localeCompare(y.standardName))
        .map((e) => ({
          epdSlug: e.epdSlug,
          standardName: e.standardName,
          category,
          subcategory: e.subcategory,
          epdSource: e.epdSource,
          declaredUnit: e.declaredUnit,
          gwpKgCo2ePerTonne: e.gwpKgCo2ePerTonne,
        })),
    }));
  return { version, categories };
}

function tokens(s: string): string[] {
  const n = normMaterialLabelForMatch(s);
  return n.split(/\s+/).filter((t) => t.length > 1);
}

/**
 * Rank dictionary rows for a user query. `score` is query overlap only (0–1 scale), not the
 * static `matchConfidence` field on dictionary rows.
 */
export function searchMaterialDictionaryByQuery(
  query: string,
  limit: number
): Array<CatalogEntry & { queryScore: number }> {
  const q = query.trim();
  if (!q) return [];
  const qTokens = new Set(tokens(q));
  if (qTokens.size === 0) return [];

  const { entries } = loadMaterialDictionaryFromDisk();
  const scored: Array<{ entry: CatalogEntry; score: number }> = [];

  for (const e of entries) {
    const category = (e.category ?? "").trim() || "Other";
    const entry: CatalogEntry = {
      epdSlug: e.epdSlug,
      standardName: e.standardName,
      category,
      subcategory: e.subcategory,
      epdSource: e.epdSource,
      declaredUnit: e.declaredUnit,
      gwpKgCo2ePerTonne: e.gwpKgCo2ePerTonne,
    };

    const hay = [
      e.standardName,
      ...e.matchPatterns,
      e.epdSlug.replace(/_/g, " "),
      category,
      e.subcategory ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const normHay = normMaterialLabelForMatch(hay);
    const hayTokens = new Set(normHay.split(/\s+/).filter((t) => t.length > 1));

    let overlap = 0;
    for (const t of qTokens) {
      if (hayTokens.has(t)) overlap += 1;
    }
    const substringBoost =
      normHay.includes(normMaterialLabelForMatch(q)) || normMaterialLabelForMatch(q).includes(normHay)
        ? 0.25
        : 0;
    const score = Math.min(1, overlap / Math.max(1, qTokens.size) + substringBoost);

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Array<CatalogEntry & { queryScore: number }> = [];
  for (const { entry, score } of scored) {
    if (seen.has(entry.epdSlug)) continue;
    seen.add(entry.epdSlug);
    out.push({ ...entry, queryScore: Math.round(score * 100) / 100 });
    if (out.length >= limit) break;
  }
  return out;
}

/** Validate slug exists in the current dictionary (for POST bindings). */
export function isValidMaterialDictionarySlug(slug: string): boolean {
  const s = slug.trim();
  if (!s) return false;
  const { entries } = loadMaterialDictionaryFromDisk();
  return entries.some((e) => e.epdSlug === s);
}

export function getDictionaryEntryBySlug(slug: string): CatalogEntry | undefined {
  const s = slug.trim();
  if (!s) return undefined;
  const { entries } = loadMaterialDictionaryFromDisk();
  const e = entries.find((x) => x.epdSlug === s);
  if (!e) return undefined;
  const category = (e.category ?? "").trim() || "Other";
  return {
    epdSlug: e.epdSlug,
    standardName: e.standardName,
    category,
    subcategory: e.subcategory,
    epdSource: e.epdSource,
    declaredUnit: e.declaredUnit,
    gwpKgCo2ePerTonne: e.gwpKgCo2ePerTonne,
  };
}
