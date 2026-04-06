import fs from "fs";
import { NextResponse } from "next/server";

import {
  getSnapshotById,
  loadSchependomlaanAsPlannedManifest,
  manifestForClient,
  resolveSnapshotAbsolutePath,
} from "@/lib/schependomlaan-as-planned-snapshots";

export const runtime = "nodejs";

/**
 * Without `snapshot`: JSON manifest (no `repoPath`) for UI pickers.
 * With `snapshot=<id>`: stream the IFC bytes (allowlist from manifest only).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshot")?.trim() ?? "";

  let manifest;
  try {
    manifest = loadSchependomlaanAsPlannedManifest();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Manifest load failed" },
      { status: 500 }
    );
  }

  if (!snapshotId) {
    return NextResponse.json(manifestForClient(manifest));
  }

  const entry = getSnapshotById(manifest, snapshotId);
  if (!entry) {
    return NextResponse.json(
      { error: "Unknown snapshot", snapshot: snapshotId },
      { status: 400 }
    );
  }

  const cwd = process.cwd();
  const filePath = resolveSnapshotAbsolutePath(cwd, entry);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid snapshot path" }, { status: 500 });
  }
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      {
        error: "IFC missing on disk",
        snapshot: snapshotId,
        fileName: entry.fileName,
      },
      { status: 404 }
    );
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);
  const filename = entry.fileName;

  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
