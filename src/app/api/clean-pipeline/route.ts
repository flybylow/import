import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = String(body?.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const kbPath = path.join(dataDir, `${projectId}-kb.ttl`);
  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      {
        error: `No KB at data/${projectId}-kb.ttl — build Phase 2 KB first.`,
      },
      { status: 400 }
    );
  }

  const kbTtl = fs.readFileSync(kbPath, "utf-8");
  // Add your cleaning pipeline logic here
  // For example:
  // const cleanedKbTtl = cleanKbTtl(kbTtl);
  // fs.writeFileSync(kbPath, cleanedKbTtl, "utf-8");

  return NextResponse.json({ message: "Pipeline cleaned successfully" }, { status: 200 });
}
