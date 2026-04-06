import { NextResponse } from "next/server";

import { materialDictionaryCatalog } from "@/lib/bestek/material-dictionary-catalog";

export const runtime = "nodejs";

/** Material dictionary grouped by `category` for Bestek Dictionary UI optgroups. */
export async function GET() {
  try {
    const { version, categories } = materialDictionaryCatalog();
    return NextResponse.json({ version, categories });
  } catch (e) {
    console.error("deliveries/bestek/materials/catalog:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Catalog failed" },
      { status: 500 }
    );
  }
}
