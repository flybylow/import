import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { parseIfcPhase1 } from "@/lib/ifc-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing IFC file. Upload field must be named `file`." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const projectId = randomUUID();

  // Persist the uploaded IFC bytes so Phase 2 steps can re-open the file later.
  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  const ifcPath = path.join(outDir, `${projectId}.ifc`);
  fs.writeFileSync(ifcPath, Buffer.from(bytes));

  const parsed = await parseIfcPhase1(bytes);

  return NextResponse.json({ projectId, parsed });
}

