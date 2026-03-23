import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing `projectId` query param" },
      { status: 400 }
    );
  }

  const dataDir = path.join(process.cwd(), "data");
  const ttlPathOnDisk = path.join(dataDir, `${projectId}-enriched.ttl`);

  if (!fs.existsSync(ttlPathOnDisk)) {
    return NextResponse.json(
      { error: `Enriched TTL not found: data/${projectId}-enriched.ttl` },
      { status: 404 }
    );
  }

  const ttl = fs.readFileSync(ttlPathOnDisk, "utf-8");
  return NextResponse.json({
    projectId,
    ttlPath: `data/${projectId}-enriched.ttl`,
    ttl,
  });
}

