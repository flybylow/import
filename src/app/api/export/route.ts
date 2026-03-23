import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return NextResponse.json(
    {
      error:
        "Export is not implemented yet. This endpoint is a stub for Phase 2.",
      details: "Coming soon: generate final Turtle/JSON-LD exports for tabulas-eu.",
      projectId: body?.projectId,
    },
    { status: 501 }
  );
}

