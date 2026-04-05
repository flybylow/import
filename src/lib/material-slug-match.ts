/**
 * Match DPP / timeline material slugs (e.g. `ifc_vebo_raamdorpel_rd_60100x160`) to IFC
 * `materialName` strings in passports. Slugs often squash dimensions (`60100` = 60+100 mm)
 * while IFC uses `60/100x160`.
 */

/** `_60100x160` ↔ `_60/100x160` at end of slug (and spaced variants). */
function expandDimensionTail(s: string): string[] {
  const out = [s];
  const m = s.match(/^(.*)_(\d{2})(\d{3})x(\d+)$/);
  if (m) {
    out.push(`${m[1]}_${m[2]}/${m[3]}x${m[4]}`);
  }
  const m2 = s.match(/^(.*)_(\d{2})\/(\d{3})x(\d+)$/);
  if (m2) {
    out.push(`${m2[1]}_${m2[2]}${m2[3]}x${m2[4]}`);
  }
  return [...new Set(out)];
}

function underscoreToSpace(s: string): string {
  return s.replace(/_/g, " ");
}

/**
 * Substrings to test with `materialName.toLowerCase().includes(needle)` (longer / more specific first).
 */
export function materialSlugMatchNeedles(slugRaw: string): string[] {
  const slug = slugRaw.trim().toLowerCase();
  if (!slug) return [];

  const candidates = new Set<string>();
  const add = (v: string) => {
    const t = v.trim().toLowerCase();
    if (t.length >= 3) candidates.add(t);
  };

  for (const base of expandDimensionTail(slug)) {
    add(base);
    add(base.replace(/^ifc_/, ""));
    add(underscoreToSpace(base));
    add(underscoreToSpace(base.replace(/^ifc_/, "")));
    for (const v of expandDimensionTail(base.replace(/^ifc_/, ""))) {
      add(v);
      add(underscoreToSpace(v));
    }
  }

  return [...candidates].sort((a, b) => b.length - a.length);
}

/**
 * When no single substring hits (naming drift), require every “significant” slug token to appear
 * in the material name. Skips `ifc`, very short tokens, and dimension-only segments.
 */
export function materialSlugTokenFallbackMatch(
  materialNameLower: string,
  slugLower: string
): boolean {
  const tokens = slugLower.split("_").filter((t) => {
    if (!t || t === "ifc") return false;
    if (t.length <= 2) return false;
    if (/^\d{2}\/\d{3}x\d+$/i.test(t)) return false;
    if (/^\d{5,}x\d+$/i.test(t)) return false;
    return true;
  });
  if (tokens.length < 2) return false;
  return tokens.every((t) => materialNameLower.includes(t));
}

export function passportMaterialMatchesSlug(
  materialName: string,
  slugLower: string
): boolean {
  const n = materialName.toLowerCase();
  for (const needle of materialSlugMatchNeedles(slugLower)) {
    if (n.includes(needle)) return true;
  }
  return materialSlugTokenFallbackMatch(n, slugLower);
}
