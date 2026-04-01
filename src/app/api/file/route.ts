import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeJoinDataFile(dataDir: string, requestedName: string) {
  // Prevent traversal: allow relative paths under `data/` only.
  const normalizedRequest = requestedName.replace(/\\/g, "/").trim();
  if (!normalizedRequest || normalizedRequest.startsWith("/")) return null;
  const fullPath = path.join(dataDir, normalizedRequest);
  const normalized = path.normalize(fullPath);
  if (!normalized.startsWith(dataDir)) return null;
  return fullPath;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing `name` query param" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const filePath = safeJoinDataFile(dataDir, name);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `File not found: data/${name}` }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  return new NextResponse(stream as any, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size),
      // Inline first, but browsers often still download for octet-stream.
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

