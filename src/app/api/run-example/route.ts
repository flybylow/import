import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { parseIfcPhase1 } from "@/lib/ifc-parser";
import {
  PHASE1_LIBRARY_SAMPLES,
  resolvePhase1LibrarySampleKey,
} from "@/lib/phase1-library-samples";
import { generateTriplesPhase1 } from "@/lib/triple-generator";

export const runtime = "nodejs";

type RunExampleRequest = {
  projectId?: string;
  /** `schependomlaan` | `small` | `lcaReview` — defaults to schependomlaan */
  sample?: string;
};

export async function POST(request: Request) {
  let body: RunExampleRequest = {};
  try {
    body = (await request.json()) as RunExampleRequest;
  } catch {
    // Allow empty body for backwards compatibility.
  }
  const projectId = body.projectId?.trim() || "example";
  const sampleKey = resolvePhase1LibrarySampleKey(body.sample ?? "");
  const dataFile = PHASE1_LIBRARY_SAMPLES[sampleKey].dataFile;
  const ifcPath = path.join(process.cwd(), "data", dataFile);

  if (!fs.existsSync(ifcPath)) {
    return NextResponse.json(
      { error: `Sample IFC not found: data/${dataFile}` },
      { status: 404 }
    );
  }

  const buf = fs.readFileSync(ifcPath);
  const bytes = new Uint8Array(buf);

  // Persist example IFC so Phase 2 can be made fully dynamic later.
  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${projectId}.ifc`), Buffer.from(bytes));

  const parsed = await parseIfcPhase1(bytes);
  const { ttlPath, ttl } = await generateTriplesPhase1({ projectId, parsed });
  return NextResponse.json({
    projectId,
    sample: sampleKey,
    sourceIfc: `data/${dataFile}`,
    ttlPath,
    ttl,
  });
}

