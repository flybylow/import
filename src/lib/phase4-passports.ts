import {
  passportDisplayTypeGroupKey,
  passportPartitionFromPassportRow,
} from "@/lib/ifc-passport-type-group";
import { passportMaterialLayerMatchesSlug } from "@/lib/material-slug-match";

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
  /** From KB EPD node (`ont:producer`), when present. */
  producer?: string;
  /** From KB EPD node (`ont:productionLocation`). */
  productionLocation?: string;
  issueDate?: string;
  validUntil?: string;
  /** From KB EPD node (`dcterms:identifier`). */
  epdIdentifier?: string;
  declaredUnit?: string;
  gwpPerUnit?: number;
  densityKgPerM3?: number;
};

export type Phase4ElementPassport = {
  elementId: number;
  elementName?: string;
  ifcType?: string;
  ifcPredefinedType?: string;
  globalId?: string;
  expressId?: number;
  ifcFireRating?: string;
  /** From `Pset_ManufacturerTypeInformation` in Phase 1 enrich (`ont:ifcManufacturer`). */
  ifcManufacturer?: string;
  ifcModelLabel?: string;
  ifcModelReference?: string;
  /** Set when API dedupes by name — how many IFC elements share this `schema:name`. */
  sameNameElementCount?: number;
  materials: Phase4PassportMaterial[];
  ifcQuantities: Array<{
    quantityName: string;
    unit?: string;
    value: number;
  }>;
};

/** Passport finder / `?group=` — includes `IfcCovering · …` when partitioned. */
export function passportTypeGroupKeyFromRow(p: Phase4ElementPassport): string {
  const part = passportPartitionFromPassportRow({
    ifcType: p.ifcType,
    ifcPredefinedType: p.ifcPredefinedType,
    elementName: p.elementName,
  });
  return passportDisplayTypeGroupKey(p.ifcType, part);
}

type KbStatusResponse = {
  error?: string;
  projectId?: string;
  /** e.g. `data/<projectId>-kb.ttl` */
  kbPath?: string;
  /** IFC element nodes in the KB graph (not the passport batch size). */
  elementCount?: number;
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
  /** Mirrors `GET /api/kb/status` — which project / KB file this batch came from. */
  projectId: string;
  kbPath?: string;
  elementCountInKb?: number;
};

/** Same query the Passports UI uses (`elementPassports` batch). Server caps at 50k. */
export const DEFAULT_ELEMENT_PASSPORTS_LIMIT = 50_000;

/** One row per IFC element (for /bim type-group visualizer). */
export const ALL_INSTANCES_PASSPORT_LIMIT = 25_000;

export async function loadPhase4PassportsAllInstances(projectId: string): Promise<Phase4PassportData> {
  return loadPhase4Passports(projectId, undefined, {
    elementPassportsLimit: ALL_INSTANCES_PASSPORT_LIMIT,
    elementPassportsUniqueName: false,
  });
}

const allInstancesByProjectCache = new Map<string, Promise<Phase4PassportData>>();

/** Shared in-flight / resolved fetch per `projectId` (BIM viewer info panel + type-group visualizer). */
export function loadPhase4PassportsAllInstancesCached(projectId: string): Promise<Phase4PassportData> {
  let p = allInstancesByProjectCache.get(projectId);
  if (!p) {
    p = loadPhase4PassportsAllInstances(projectId);
    allInstancesByProjectCache.set(projectId, p);
  }
  return p;
}

/** Deduped express ids for KB rows whose `ifcType` matches (after trim, or `Unknown`). */
export function expressIdsByIfcTypeKey(
  ordered: Phase4ElementPassport[],
  ifcTypeKey: string
): number[] {
  const key = ifcTypeKey.trim() || "Unknown";
  const set = new Set<number>();
  for (const p of ordered) {
    const t = p.ifcType?.trim() || "Unknown";
    if (t !== key) continue;
    const ex = p.expressId ?? p.elementId;
    if (Number.isFinite(ex)) set.add(Number(ex));
  }
  return [...set];
}

export function expressIdsFireRatedDoors(ordered: Phase4ElementPassport[]): number[] {
  const set = new Set<number>();
  for (const p of ordered) {
    if (!/\bdoor\b/i.test(p.ifcType ?? "") || !p.ifcFireRating?.trim()) continue;
    const ex = p.expressId ?? p.elementId;
    if (Number.isFinite(ex)) set.add(Number(ex));
  }
  return [...set];
}

/** One row per expressId for UI cards (deduped, sorted by expressId). */
export type GroupElementSummary = {
  expressId: number;
  elementId: number;
  elementName?: string;
  ifcType?: string;
  ifcFireRating?: string;
};

function mergeSummary(
  map: Map<number, GroupElementSummary>,
  p: Phase4ElementPassport
): void {
  const ex = p.expressId ?? p.elementId;
  if (!Number.isFinite(ex)) return;
  const id = Number(ex);
  if (map.has(id)) return;
  map.set(id, {
    expressId: id,
    elementId: p.elementId,
    elementName: p.elementName,
    ifcType: p.ifcType,
    ifcFireRating: p.ifcFireRating,
  });
}

export function elementSummariesByIfcTypeKey(
  ordered: Phase4ElementPassport[],
  ifcTypeKey: string
): GroupElementSummary[] {
  const key = ifcTypeKey.trim() || "Unknown";
  const map = new Map<number, GroupElementSummary>();
  for (const p of ordered) {
    const t = p.ifcType?.trim() || "Unknown";
    if (t !== key) continue;
    mergeSummary(map, p);
  }
  return [...map.values()].sort((a, b) => a.expressId - b.expressId);
}

export function elementSummariesFireRatedDoors(
  ordered: Phase4ElementPassport[]
): GroupElementSummary[] {
  const map = new Map<number, GroupElementSummary>();
  for (const p of ordered) {
    if (!/\bdoor\b/i.test(p.ifcType ?? "") || !p.ifcFireRating?.trim()) continue;
    mergeSummary(map, p);
  }
  return [...map.values()].sort((a, b) => a.expressId - b.expressId);
}

/** Match rule aligned with timeline construction buildup (`passportMatchesMaterialSlug`). */
function passportRowMatchesMaterialSlug(p: Phase4ElementPassport, slugLower: string): boolean {
  for (const m of p.materials) {
    if (passportMaterialLayerMatchesSlug(m.materialName, m.epdSlug, slugLower)) return true;
  }
  return false;
}

/**
 * IFC instances whose passport materials match a URL / timeline slug: **exact `epdSlug`** on a linked
 * layer, else {@link passportMaterialLayerMatchesSlug} on IFC `materialName` (substring / token rules).
 */
export function elementSummariesByMaterialSlug(
  ordered: Phase4ElementPassport[],
  materialSlug: string
): GroupElementSummary[] {
  const slug = materialSlug.trim().toLowerCase();
  if (!slug) return [];
  const map = new Map<number, GroupElementSummary>();
  for (const p of ordered) {
    if (!passportRowMatchesMaterialSlug(p, slug)) continue;
    mergeSummary(map, p);
  }
  return [...map.values()].sort((a, b) => a.expressId - b.expressId);
}

/**
 * Dedupe key aligned with `GET /api/kb/status` when `elementPassportsUniqueName` is true:
 * trimmed lowercase `schema:name`, or `__unnamed__:${elementId}` (KB element id).
 */
export function elementPassportNameDedupeKey(p: Phase4ElementPassport): string {
  const t = p.elementName?.trim();
  if (t) return t.toLowerCase();
  return `__unnamed__:${p.elementId}`;
}

/** Every IFC instance in `ordered` that shares the same name key (one summary per expressId). */
export function instanceSummariesForNameDedupeKey(
  ordered: Phase4ElementPassport[],
  nameKey: string
): GroupElementSummary[] {
  const map = new Map<number, GroupElementSummary>();
  for (const p of ordered) {
    if (elementPassportNameDedupeKey(p) !== nameKey) continue;
    mergeSummary(map, p);
  }
  return [...map.values()].sort((a, b) => a.expressId - b.expressId);
}

/** Relative path + query for `GET /api/kb/status` (passport slice). */
export function kbStatusPassportsUrl(
  projectId: string,
  options?: {
    elementPassportsLimit?: number;
    elementPassportsUniqueName?: boolean;
  }
): string {
  const limit = options?.elementPassportsLimit ?? DEFAULT_ELEMENT_PASSPORTS_LIMIT;
  const uniqueName = options?.elementPassportsUniqueName ?? false;
  return (
    `/api/kb/status?projectId=${encodeURIComponent(projectId)}` +
    `&elementPassportsLimit=${encodeURIComponent(String(limit))}` +
    `&elementPassportsUniqueName=${uniqueName ? "true" : "false"}`
  );
}

export async function loadPhase4Passports(
  projectId: string,
  onPhase?: (label: string) => void,
  options?: {
    elementPassportsLimit?: number;
    elementPassportsUniqueName?: boolean;
  }
): Promise<Phase4PassportData> {
  const url = kbStatusPassportsUrl(projectId, {
    elementPassportsLimit: options?.elementPassportsLimit,
    elementPassportsUniqueName: options?.elementPassportsUniqueName,
  });
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
    projectId: json.projectId ?? projectId,
    kbPath: json.kbPath,
    elementCountInKb:
      typeof json.elementCount === "number" ? json.elementCount : undefined,
  };
}
