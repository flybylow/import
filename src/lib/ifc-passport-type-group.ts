/**
 * Passport + Bestek grouping for coarse IFC classes that mix many spec-relevant variants
 * (e.g. `IfcCovering`: ceiling vs floor finish vs membrane).
 */

import type * as WebIFC from "web-ifc";

/** IFC classes that get an extra “· suffix” partition in passports / phase-0 groups. */
export const IFC_TYPES_WITH_PASSPORT_PARTITION = new Set<string>(["IfcCovering"]);

function normalizeIfcClassName(typeName: string): string {
  return typeName.trim();
}

export function shouldPartitionIfcType(ifcType: string | undefined): boolean {
  const t = (ifcType ?? "").trim();
  return IFC_TYPES_WITH_PASSPORT_PARTITION.has(t);
}

export function unwrapIfcLabel(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const s = v.trim();
    return s.length > 0 ? s : undefined;
  }
  if (typeof v === "object" && v !== null && "value" in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === "string") {
      const s = inner.trim();
      return s.length > 0 ? s : undefined;
    }
    if (typeof inner === "number" && Number.isFinite(inner)) {
      return String(inner);
    }
  }
  return undefined;
}

/**
 * IFC4 `IfcCoveringTypeEnum` declaration order (0-based indices as emitted by web-ifc).
 * When `PredefinedType` is an ENUM numeric, map for a readable partition label.
 */
const IFC4_COVERING_TYPE_ENUM_ORDER = [
  "CEILING",
  "FLOORING",
  "CLADDING",
  "ROOFING",
  "MOLDING",
  "SKIRTINGBOARD",
  "INSULATION",
  "MEMBRANE",
  "SLEEVING",
  "WRAPPING",
  "COPING",
  "USERDEFINED",
  "NOTDEFINED",
] as const;

/** Parse `PredefinedType` from `GetLine` (ENUM wrapper, string, or number). */
export function extractIfcPredefinedTypeLabel(pre: unknown): string | undefined {
  if (pre == null) return undefined;
  if (typeof pre === "string") {
    const s = pre.trim().toUpperCase().replace(/\s+/g, "_");
    return s.length > 0 ? s : undefined;
  }
  if (typeof pre === "object" && pre !== null && "type" in pre) {
    const t = (pre as { type?: unknown }).type;
    const val = (pre as { value?: unknown }).value;
    if (t === 3 && typeof val === "number" && Number.isFinite(val)) {
      const i = Math.trunc(val);
      if (i >= 0 && i < IFC4_COVERING_TYPE_ENUM_ORDER.length) {
        return IFC4_COVERING_TYPE_ENUM_ORDER[i];
      }
      return `COVERING_ENUM_${i}`;
    }
    if (typeof val === "string" && val.trim()) return val.trim().toUpperCase();
    if (typeof val === "number" && Number.isFinite(val)) {
      const i = Math.trunc(val);
      if (i >= 0 && i < IFC4_COVERING_TYPE_ENUM_ORDER.length) {
        return IFC4_COVERING_TYPE_ENUM_ORDER[i];
      }
    }
  }
  if (typeof pre === "number" && Number.isFinite(pre)) {
    const i = Math.trunc(pre);
    if (i >= 0 && i < IFC4_COVERING_TYPE_ENUM_ORDER.length) {
      return IFC4_COVERING_TYPE_ENUM_ORDER[i];
    }
  }
  return undefined;
}

function isWeakCoveringName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 2) return true;
  if (/^\d+$/.test(n)) return true;
  if (/^covering\b/.test(n)) return true;
  if (/^ifc\b/.test(n)) return true;
  if (n === "default" || n === "n/a" || n === "na") return true;
  return false;
}

export function sanitizePassportPartitionLabel(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > 72 ? `${s.slice(0, 70)}…` : s;
}

export type IfcLineLike = Record<string, unknown>;

/**
 * Sync partition for `IfcCovering` from an IFC element line (`GetLine`).
 * Returns `undefined` when no usable partition (caller may try materials).
 */
export function ifcCoveringPartitionFromElementLine(
  typeName: string,
  line: IfcLineLike | null | undefined
): string | undefined {
  if (!shouldPartitionIfcType(typeName)) return undefined;
  const pre = extractIfcPredefinedTypeLabel(line?.PredefinedType);
  if (pre) return sanitizePassportPartitionLabel(pre);
  const nm =
    unwrapIfcLabel(line?.Name) ?? unwrapIfcLabel(line?.ObjectType) ?? undefined;
  if (nm && !isWeakCoveringName(nm)) {
    return sanitizePassportPartitionLabel(nm);
  }
  return undefined;
}

export async function ifcCoveringPartitionWithMaterialsFallback(args: {
  ifcApi: WebIFC.IfcAPI;
  modelId: number;
  expressId: number;
  typeName: string;
  line: IfcLineLike | null | undefined;
}): Promise<string | undefined> {
  const sync = ifcCoveringPartitionFromElementLine(args.typeName, args.line);
  if (sync) return sync;
  if (!shouldPartitionIfcType(args.typeName)) return undefined;

  try {
    const mats = await args.ifcApi.properties.getMaterialsProperties(
      args.modelId,
      args.expressId
    );
    if (!Array.isArray(mats) || mats.length === 0) return undefined;
    const labels: string[] = [];
    for (const m of mats.slice(0, 3)) {
      const mid = Number((m as { expressID?: unknown }).expressID);
      if (!Number.isFinite(mid)) continue;
      const ml = args.ifcApi.GetLine(args.modelId, mid, false, true) as IfcLineLike;
      const lab = unwrapIfcLabel(ml?.Name);
      if (lab && !isWeakCoveringName(lab)) labels.push(lab);
    }
    if (labels.length === 0) return undefined;
    return sanitizePassportPartitionLabel(labels.join(" + "));
  } catch {
    return undefined;
  }
}

/** Finder / URL / Bestek display key: `IfcCovering · CEILING` or raw IFC class. */
export function passportDisplayTypeGroupKey(
  ifcType: string | undefined,
  partition?: string | null
): string {
  const base = passportFinderTypeKey(ifcType);
  const p = partition?.trim();
  if (!p || !shouldPartitionIfcType(ifcType ?? "")) return base;
  return `${base} · ${p}`;
}

/** Legacy helper — base IFC type only (no partition). */
export function passportFinderTypeKey(ifcType?: string): string {
  const t = ifcType?.trim();
  return t && t.length > 0 ? t : "—";
}

export function passportPartitionFromPassportRow(args: {
  ifcType?: string;
  ifcPredefinedType?: string;
  elementName?: string;
}): string | undefined {
  if (!shouldPartitionIfcType(args.ifcType)) return undefined;
  const pre = args.ifcPredefinedType?.trim();
  if (pre) return sanitizePassportPartitionLabel(pre);
  const nm = args.elementName?.trim();
  if (nm && !isWeakCoveringName(nm)) {
    return sanitizePassportPartitionLabel(nm);
  }
  return undefined;
}
