/**
 * Lightweight heuristics on free-form architect / bestek text.
 * Human review always required — this only suggests structure.
 */

/** e.g. 10.1, 12.3.2 from running text */
export function extractArticleTokenCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\b\d+(?:\.\d+)+\b/g;
  let m: RegExpExecArray | null;
  const s = text;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    const v = m[0];
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.slice(0, 16);
}

/** Dictionary / material category names that appear verbatim in the text (case-insensitive). */
export function extractCategoryHintsFromText(text: string, categoryNames: string[]): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of categoryNames) {
    const raw = c.trim();
    if (raw.length < 3) continue;
    const k = raw.toLowerCase();
    if (t.includes(k) && !seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  return out.slice(0, 10);
}
