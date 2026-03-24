import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "@thatopen",
    "fragments",
    "dist",
    "Worker",
    "worker.mjs"
  );

  if (!fs.existsSync(workerPath)) {
    return NextResponse.json(
      { error: "Fragments worker not found in node_modules." },
      { status: 404 }
    );
  }

  const code = fs.readFileSync(workerPath, "utf-8");
  return new NextResponse(code, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
