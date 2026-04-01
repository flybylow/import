import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

type QuantityKind = "mass" | "volume" | "area" | "length";

type OverridesFileV1 = {
  schemaVersion: 1;
  updatedAt: string;
  overrides: Record<
    string,
    {
      quantityKind: QuantityKind;
      /** Per-instance (NOT scaled by instanceCount). */
      quantityValue: number;
      updatedAt: string;
    }
  >;
};

function dataPathForProject(projectId: string) {
  const dataDir = path.join(process.cwd(), "data");
  return path.join(dataDir, `${projectId}-passport-quantity-overrides.json`);
}

function readOverrides(projectId: string): OverridesFileV1 {
  const p = dataPathForProject(projectId);
  if (!fs.existsSync(p)) {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), overrides: {} };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as OverridesFileV1;
    if (parsed?.schemaVersion !== 1 || typeof parsed?.overrides !== "object") {
      return { schemaVersion: 1, updatedAt: new Date().toISOString(), overrides: {} };
    }
    return parsed;
  } catch {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), overrides: {} };
  }
}

function writeOverrides(projectId: string, next: OverridesFileV1) {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataPathForProject(projectId), JSON.stringify(next, null, 2), "utf-8");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const signatureId = searchParams.get("signatureId") ?? "";

  if (!projectId) {
    return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  }

  const file = readOverrides(projectId);
  if (signatureId) {
    return NextResponse.json({
      projectId,
      signatureId,
      override: file.overrides[signatureId] ?? null,
    });
  }

  return NextResponse.json({ projectId, overrides: file.overrides });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = (body as any)?.projectId as string | undefined;
  const signatureId = (body as any)?.signatureId as string | undefined;
  const quantityKind = (body as any)?.quantityKind as QuantityKind | undefined;
  const quantityValueRaw = (body as any)?.quantityValue as number | string | undefined;
  const clear = Boolean((body as any)?.clear);

  if (!projectId) return NextResponse.json({ error: "Missing `projectId`" }, { status: 400 });
  if (!signatureId) return NextResponse.json({ error: "Missing `signatureId`" }, { status: 400 });

  const file = readOverrides(projectId);
  const now = new Date().toISOString();

  if (clear) {
    delete file.overrides[signatureId];
    file.updatedAt = now;
    writeOverrides(projectId, file);
    return NextResponse.json({ projectId, signatureId, override: null });
  }

  if (!quantityKind || !["mass", "volume", "area", "length"].includes(quantityKind)) {
    return NextResponse.json({ error: "Invalid `quantityKind`" }, { status: 400 });
  }

  const quantityValue = typeof quantityValueRaw === "string" ? Number(quantityValueRaw) : quantityValueRaw;
  if (quantityValue == null || !Number.isFinite(quantityValue) || quantityValue <= 0) {
    return NextResponse.json({ error: "Invalid `quantityValue`" }, { status: 400 });
  }

  file.overrides[signatureId] = {
    quantityKind,
    quantityValue,
    updatedAt: now,
  };
  file.updatedAt = now;
  writeOverrides(projectId, file);

  return NextResponse.json({ projectId, signatureId, override: file.overrides[signatureId] });
}

