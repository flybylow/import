import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Back-compat: old hard-coded Week 26 URL → registry id `week26`. */
export async function GET(request: Request) {
  const base = new URL(request.url);
  const target = new URL(base);
  target.pathname = "/api/lab/as-planned-ifc";
  target.search = "";
  target.searchParams.set("snapshot", "week26");
  return NextResponse.redirect(target, 307);
}
