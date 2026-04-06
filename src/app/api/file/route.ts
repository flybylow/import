import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Readable dirs for `?name=` (same traversal rules each). `data/` first — then material sources under docs. */
const FILE_SERVE_ROOTS = [
  path.join(process.cwd(), "data"),
  path.join(process.cwd(), "docs", "DataSetMaterials"),
] as const;

function safeJoinUnderRoot(rootDir: string, requestedName: string): string | null {
  const normalizedRequest = requestedName.replace(/\\/g, "/").trim();
  if (!normalizedRequest || normalizedRequest.startsWith("/")) return null;
  const rootAbs = path.resolve(rootDir);
  const fullPath = path.resolve(path.join(rootAbs, normalizedRequest));
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (fullPath !== rootAbs && !fullPath.startsWith(prefix)) return null;
  return fullPath;
}

function resolveServedFile(requestedName: string): { absPath: string | null; tried: string[] } {
  const tried: string[] = [];
  for (const root of FILE_SERVE_ROOTS) {
    const p = safeJoinUnderRoot(root, requestedName);
    if (!p) continue;
    tried.push(path.relative(process.cwd(), p) || p);
    if (fs.existsSync(p)) return { absPath: p, tried };
  }
  return { absPath: null, tried };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing `name` query param" }, { status: 400 });
  }

  const resolved = resolveServedFile(name);
  if (resolved.tried.length === 0) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  if (resolved.absPath == null) {
    return NextResponse.json(
      {
        error: `File not found: ${name}`,
        tried: resolved.tried,
        hint:
          "Place the file under data/ or docs/DataSetMaterials/ (KBOB Excel imports record the basename only).",
      },
      { status: 404 }
    );
  }

  const filePath = resolved.absPath;
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

