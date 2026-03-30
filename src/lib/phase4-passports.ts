export type Phase4PassportMaterial = {
  materialId: number;
  materialName: string;
  hasEPD: boolean;
  epdSlug?: string;
  epdName?: string;
  matchType?: string;
  matchConfidence?: number;
  lcaReady?: boolean;
  epdDataProvenance?: string;
  sourceProductUri?: string;
  sourceFileName?: string;
  declaredUnit?: string;
  gwpPerUnit?: number;
  densityKgPerM3?: number;
};

export type Phase4ElementPassport = {
  elementId: number;
  elementName?: string;
  ifcType?: string;
  globalId?: string;
  expressId?: number;
  materials: Phase4PassportMaterial[];
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

type KbStatusResponse = {
  error?: string;
  elementPassports?: Phase4ElementPassport[];
  elementPassportTotal?: number;
};

export class Phase4PassportLoadError extends Error {
  code: "KB_MISSING" | "REQUEST_FAILED";

  constructor(code: "KB_MISSING" | "REQUEST_FAILED", message: string) {
    super(message);
    this.name = "Phase4PassportLoadError";
    this.code = code;
  }
}

export type Phase4PassportData = {
  byExpressId: Record<number, Phase4ElementPassport>;
  ordered: Phase4ElementPassport[];
  total: number;
};

export async function loadPhase4Passports(
  projectId: string,
  onPhase?: (label: string) => void
): Promise<Phase4PassportData> {
  const url =
    `/api/kb/status?projectId=${encodeURIComponent(projectId)}` +
    `&elementPassportsLimit=300&elementPassportsUniqueName=false`;
  onPhase?.("Requesting KB status…");
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      msg = parsed.error ?? text;
    } catch {
      // Keep raw text fallback
    }
    if (res.status === 404 && msg.includes("KB not found")) {
      throw new Phase4PassportLoadError(
        "KB_MISSING",
        "No linked KB for the current project. Build Phase 2 first."
      );
    }
    throw new Phase4PassportLoadError(
      "REQUEST_FAILED",
      msg || "Failed to load passports."
    );
  }
  onPhase?.("Reading response…");
  const json: KbStatusResponse = await res.json();
  onPhase?.("Building passport index…");
  const ordered = (json.elementPassports ?? []).map((p) => ({
    ...p,
    expressId: Number.isFinite(Number(p.expressId)) ? Number(p.expressId) : p.elementId,
  }));
  const byExpressId: Record<number, Phase4ElementPassport> = {};
  for (const p of ordered) {
    byExpressId[p.expressId ?? p.elementId] = p;
  }
  return {
    byExpressId,
    ordered,
    total: json.elementPassportTotal ?? ordered.length,
  };
}
