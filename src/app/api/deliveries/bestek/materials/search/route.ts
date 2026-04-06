import { NextResponse } from "next/server";

import { searchMaterialDictionaryByQuery } from "@/lib/bestek/material-dictionary-catalog";

export const runtime = "nodejs";

/**
 * Typeahead helper: ranks rows by query token overlap (`queryScore`), not dictionary `matchConfidence`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(25, Math.max(1, Number(limitRaw) || 8));

  try {
    const results = searchMaterialDictionaryByQuery(q, limit);
    return NextResponse.json({ query: q, limit, results, total: results.length });
  } catch (e) {
    console.error("deliveries/bestek/materials/search:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 500 }
    );
  }
}
