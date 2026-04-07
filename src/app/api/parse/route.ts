import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  IFC_PARSE_ROUTE_MAX_DURATION_SEC,
  IFC_PROXY_CLIENT_MAX_BODY_BYTES,
} from "../../../../config/ifc-server.mjs";
import {
  IfcUploadValidationError,
  parseIfcPhase1,
  summarizeIfcParsedPhase1,
} from "@/lib/ifc-parser";

export const runtime = "nodejs";

/** Large web-ifc parses — platform hint (e.g. Vercel); see `config/ifc-server.mjs`. */
export const maxDuration = IFC_PARSE_ROUTE_MAX_DURATION_SEC;

/**
 * Large IFCs produce a huge spatial tree; returning it as JSON OOMs or exceeds response limits.
 * Clients (e.g. `/view` upload) only need `projectId` + optional summary.
 */
export async function POST(request: Request) {
  try {
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

    if (bytes.length > IFC_PROXY_CLIENT_MAX_BODY_BYTES) {
      const mb = Math.round(IFC_PROXY_CLIENT_MAX_BODY_BYTES / (1024 * 1024));
      return NextResponse.json(
        {
          error: `IFC is larger than the server upload limit (${mb} MiB). Raise IFC_PROXY_CLIENT_MAX_BODY_BYTES in config/ifc-server.mjs and proxyClientMaxBodySize in next.config.mjs.`,
        },
        { status: 413 }
      );
    }

    const parsed = await parseIfcPhase1(bytes);
    const summary = summarizeIfcParsedPhase1(parsed);

    const projectId = randomUUID();
    // Persist only after a successful parse so broken uploads (e.g. Git LFS pointers) do not land in data/.
    const outDir = path.join(process.cwd(), "data");
    fs.mkdirSync(outDir, { recursive: true });
    const ifcPath = path.join(outDir, `${projectId}.ifc`);
    fs.writeFileSync(ifcPath, Buffer.from(bytes));

    return NextResponse.json({ projectId, summary });
  } catch (e) {
    if (e instanceof IfcUploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[api/parse]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "IFC parse failed" },
      { status: 500 }
    );
  }
}

