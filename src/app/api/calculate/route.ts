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
        "Step 3 Calculate is not implemented yet. This endpoint is a stub for Phase 2.",
      details: "Coming soon: carbon calculation + building/storey aggregation + data gaps.",
      projectId: body?.projectId,
    },
    { status: 501 }
  );
}

