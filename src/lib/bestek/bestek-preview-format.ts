/**
 * Draft “bestek-style” text for the Deliveries panel. Money is placeholder only.
 */

export type BestekPreviewCatalog = { category: string; entries: { epdSlug: string }[] }[];

export function bestekArticleChapterKey(articleNumber: string): string {
  const t = articleNumber.trim();
  const m = /^(\d+)/.exec(t);
  return m ? m[1] : "_";
}

export function categoryLabelForSlug(catalog: BestekPreviewCatalog, slug: string): string {
  const s = slug.trim();
  if (!s) return "Overige";
  for (const cat of catalog) {
    if (cat.entries.some((e) => e.epdSlug === s)) return cat.category;
  }
  return "Overige";
}

/** Placeholder tender unit rates (EUR) for preview only. */
export function hardcodedUnitPriceEur(unitRaw: string): number {
  const u = unitRaw.trim().toLowerCase();
  if (u.includes("m²") || u.includes("m2")) return 42;
  if (u.includes("m³") || u.includes("m3")) return 185;
  if (u.includes("stuk") || u === "st") return 120;
  if (u.includes("kg")) return 3.5;
  return 50;
}

export function parseQtyLoose(q: string): number | null {
  const t = q.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatEuroNl(n: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

export type BestekPreviewRowInput = {
  group_id: string;
  article_number: string;
  article_unit: string;
  article_quantity: string;
  architect_name: string;
  material_slug: string;
  or_equivalent: boolean;
};

export type BestekPreviewLine = {
  group_id: string;
  article_number: string;
  architect_name: string;
  material_slug: string;
  or_equivalent: boolean;
  article_unit: string;
  article_quantity: string;
  unitPriceEur: number;
  lineTotalEur: number | null;
  opmetingsstaatLine: string;
};

export type BestekPreviewChapter = {
  chapterKey: string;
  chapterTitle: string;
  lines: BestekPreviewLine[];
};

function opmetingsstaatParts(input: {
  article_number: string;
  architect_name: string;
  qty: string;
  unit: string;
  unitPrice: number;
  lineTotal: number | null;
}): string {
  const art = input.article_number.trim() || "—";
  const label = input.architect_name.trim().split(/\n/)[0]?.trim() || "—";
  const q = input.qty.trim() || "—";
  const u = input.unit.trim() || "—";
  const pu = formatEuroNl(input.unitPrice);
  const total =
    input.lineTotal != null ? formatEuroNl(input.lineTotal) : "— (geen hoeveelheid)";
  return `Opmetingsstaat: Art. ${art} | ${label} | ${q} ${u} | ${pu}/${u === "—" ? "eenheid" : u} | = ${total}`;
}

/**
 * Build grouped preview from bound rows (caller filters to rows with architect text).
 */
export function buildBestekPreviewChapters(
  rows: BestekPreviewRowInput[],
  catalog: BestekPreviewCatalog
): BestekPreviewChapter[] {
  const byChapter = new Map<string, BestekPreviewRowInput[]>();
  for (const row of rows) {
    const k = bestekArticleChapterKey(row.article_number);
    if (!byChapter.has(k)) byChapter.set(k, []);
    byChapter.get(k)!.push(row);
  }

  const keys = [...byChapter.keys()].sort((a, b) => {
    if (a === "_") return 1;
    if (b === "_") return -1;
    return Number(a) - Number(b) || a.localeCompare(b);
  });

  return keys.map((chapterKey) => {
    const chapterRows = byChapter.get(chapterKey)!;
    const firstSlug = chapterRows[0]?.material_slug ?? "";
    const catLabel = categoryLabelForSlug(catalog, firstSlug);
    const chapterTitle =
      chapterKey === "_" ? `Overige — ${catLabel}` : `ARTIKEL ${chapterKey} — ${catLabel.toUpperCase()}`;

    const lines: BestekPreviewLine[] = chapterRows.map((r) => {
      const unitPriceEur = hardcodedUnitPriceEur(r.article_unit);
      const qtyN = parseQtyLoose(r.article_quantity);
      const lineTotalEur = qtyN != null ? qtyN * unitPriceEur : null;
      const opmetingsstaatLine = opmetingsstaatParts({
        article_number: r.article_number,
        architect_name: r.architect_name,
        qty: r.article_quantity,
        unit: r.article_unit,
        unitPrice: unitPriceEur,
        lineTotal: lineTotalEur,
      });
      return {
        group_id: r.group_id,
        article_number: r.article_number,
        architect_name: r.architect_name,
        material_slug: r.material_slug,
        or_equivalent: r.or_equivalent,
        article_unit: r.article_unit,
        article_quantity: r.article_quantity,
        unitPriceEur,
        lineTotalEur,
        opmetingsstaatLine,
      };
    });

    lines.sort((a, b) =>
      a.article_number.trim().localeCompare(b.article_number.trim(), "nl", { numeric: true })
    );

    return { chapterKey, chapterTitle, lines };
  });
}
