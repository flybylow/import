import { NextResponse } from "next/server";
import { generateTriplesPhase1 } from "@/lib/triple-generator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body?.projectId;
  const parsed = body?.parsed;

  if (!projectId || !parsed) {
    return NextResponse.json(
      { error: "Missing `projectId` or `parsed` in request body" },
      { status: 400 }
    );
  }

  const { ttlPath, ttl } = await generateTriplesPhase1({ projectId, parsed });
  return NextResponse.json({ projectId, ttlPath, ttl });
}

