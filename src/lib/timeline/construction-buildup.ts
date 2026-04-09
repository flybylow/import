import type { Phase4ElementPassport } from "@/lib/phase4-passports";
import { passportMaterialLayerMatchesSlug } from "@/lib/material-slug-match";
import type { TimelineBcfFields } from "@/lib/timeline-events";
import { parseBcfIfcGuidsJsonField } from "@/lib/timeline-events";

/** Minimal row shape from the timeline API / TTL parser. */
export type TimelineBuildupEvent = {
  timestampIso: string;
  message?: string;
  targetExpressId?: number;
  materialReference?: string;
};

const BIM_ELEMENT_RE = /bim:element\/IFC_([^\s]+)/gi;
/** KB-style `bim:element-12345` in free text → express id (same as `bim:element-*` in Turtle). */
const KB_ELEMENT_EXPRESS_RE = /\bbim:element-(\d+)\b/gi;

/** IFC-ish type words we can match against `ifcType` (IfcWall, Wall, …). */
const IFC_TYPE_HINT =
  /\b(Wall|Slab|Beam|Column|Door|Window|Roof|Stair|Plate|Member|Footing|Railing|Covering|Ramp|Pile)\b/i;

export function parseBimGlobalIdsFromMessage(message?: string): string[] {
  if (!message?.trim()) return [];
  const out: string[] = [];
  BIM_ELEMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BIM_ELEMENT_RE.exec(message)) !== null) {
    const g = m[1]?.trim();
    if (g) out.push(g);
  }
  return out;
}

export function normalizeGlobalIdKey(id: string): string {
  return id.replace(/^IFC_/i, "").trim();
}

/** Keys to index / resolve IFC globalIds (KB literals often omit `IFC_` and may differ in case). */
export function globalIdLookupKeyVariants(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const stripped = normalizeGlobalIdKey(t);
  const upper = stripped.toUpperCase();
  const lower = stripped.toLowerCase();
  return [
    ...new Set([
      t,
      stripped,
      upper,
      lower,
      `IFC_${stripped}`,
      `IFC_${upper}`,
      `IFC_${lower}`,
    ]),
  ];
}

export function parseKbElementExpressIdsFromMessage(message?: string): number[] {
  if (!message?.trim()) return [];
  const out: number[] = [];
  KB_ELEMENT_EXPRESS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KB_ELEMENT_EXPRESS_RE.exec(message)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(Math.floor(n));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function lookupExpressIdForIfcGlobalIdTail(
  tailFromMessage: string,
  map: Map<string, number>
): number | undefined {
  for (const k of globalIdLookupKeyVariants(tailFromMessage)) {
    const ex = map.get(k);
    if (ex != null) return ex;
  }
  return undefined;
}

/** Shape needed to resolve deep links (timeline detail panel, etc.). */
export type TimelineLinkResolutionInput = {
  message?: string;
  targetExpressId?: number;
  bcfFields?: TimelineBcfFields;
};

/**
 * Express ids for BIM / KB / 3D links: explicit id, `bim:element-N` in text, `bim:element/IFC_*` → passport map, BCF guid.
 */
export function resolveTimelineExpressIdsForLinks(
  ev: TimelineLinkResolutionInput,
  globalMap: Map<string, number>
): number[] {
  const out = new Set<number>();
  if (ev.targetExpressId != null && Number.isFinite(ev.targetExpressId)) {
    out.add(Math.floor(ev.targetExpressId));
  }
  for (const ex of parseKbElementExpressIdsFromMessage(ev.message)) {
    out.add(ex);
  }
  for (const gid of parseBimGlobalIdsFromMessage(ev.message)) {
    const resolved = lookupExpressIdForIfcGlobalIdTail(gid, globalMap);
    if (resolved != null) out.add(resolved);
  }
  const bcfGuids = new Set<string>();
  for (const g of parseBcfIfcGuidsJsonField(ev.bcfFields?.bcfIfcGuidsJson)) {
    bcfGuids.add(g);
  }
  const single = ev.bcfFields?.ifcGuid?.trim();
  if (single) bcfGuids.add(single);

  for (const bcfG of bcfGuids) {
    const tail = bcfG.replace(/^IFC_/i, "");
    const r =
      lookupExpressIdForIfcGlobalIdTail(bcfG, globalMap) ??
      lookupExpressIdForIfcGlobalIdTail(tail, globalMap);
    if (r != null) out.add(r);
  }
  return [...out].sort((a, b) => a - b);
}

export function parseElementsAffectedCount(message?: string): number | undefined {
  if (!message?.trim()) return undefined;
  const m = message.match(/Elements:\s*(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function parseIfcTypeHintFromMessage(message?: string): string | undefined {
  if (!message?.trim()) return undefined;
  const line = message.split("\n")[0] ?? message;
  const m = line.match(IFC_TYPE_HINT);
  return m?.[1];
}

export function materialSlugFromReference(ref?: string): string | undefined {
  if (!ref?.trim()) return undefined;
  const last = ref.trim().split("/").pop()?.toLowerCase() ?? "";
  return last || undefined;
}

/**
 * Parse a numeric KB `bim:material-*` id from a timeline reference string.
 * Supports plain `17496`, `bim:material-17496`, or the last path segment when it is all digits.
 */
export function parseKbMaterialIdFromReference(ref: string | undefined): number | undefined {
  if (!ref?.trim()) return undefined;
  const t = ref.trim();
  const direct = /^(\d+)$/.exec(t);
  if (direct) {
    const n = Number(direct[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  const m = /\bbim:material-(\d+)\b/i.exec(t);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  const last = t.split("/").pop()?.trim() ?? "";
  const lastNum = /^(\d+)$/.exec(last);
  if (lastNum) {
    const n = Number(lastNum[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function passportHasMaterialId(
  ordered: readonly Phase4ElementPassport[],
  materialId: number
): boolean {
  for (const p of ordered) {
    for (const m of p.materials) {
      if (m.materialId === materialId) return true;
    }
  }
  return false;
}

/**
 * Map `timeline:materialReference` (e.g. `dpp:material/ifc_dakpan_…`) to a KB `material-*` id using
 * passport rows (same slug ↔ name rules as calculate / graph).
 *
 * Also resolves **numeric** ids (`17496`, `bim:material-17496`) when that material exists in the
 * KB passports for this project (e.g. EPCIS ingest with `kbMaterialId`).
 */
export function resolveKbMaterialIdFromMaterialReference(
  materialReference: string | undefined,
  ordered: readonly Phase4ElementPassport[]
): number | undefined {
  const directId = parseKbMaterialIdFromReference(materialReference);
  if (directId != null && passportHasMaterialId(ordered, directId)) {
    return directId;
  }

  const slug = materialSlugFromReference(materialReference);
  if (!slug) return undefined;
  let best: number | undefined;
  for (const p of ordered) {
    for (const m of p.materials) {
      if (!passportMaterialLayerMatchesSlug(m.materialName, m.epdSlug, slug)) continue;
      const mid = m.materialId;
      if (!Number.isFinite(mid)) continue;
      if (best == null || mid < best) best = mid;
    }
  }
  return best;
}

function passportMatchesMaterialSlug(p: Phase4ElementPassport, slug: string): boolean {
  const slugLower = slug.trim().toLowerCase();
  for (const m of p.materials) {
    if (passportMaterialLayerMatchesSlug(m.materialName, m.epdSlug, slugLower)) return true;
  }
  return false;
}

function passportMatchesTypeHint(p: Phase4ElementPassport, hint?: string): boolean {
  if (!hint) return false;
  const t = (p.ifcType ?? "").toLowerCase();
  const w = hint.toLowerCase();
  return t.includes(w) || t.includes(`ifc${w}`);
}

function expressOf(p: Phase4ElementPassport): number | undefined {
  const ex = p.expressId ?? p.elementId;
  return Number.isFinite(ex) ? Number(ex) : undefined;
}

/**
 * Build globalId (from BIM URI tail) → expressId using passport rows.
 */
export function globalIdToExpressIdMap(
  ordered: readonly Phase4ElementPassport[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of ordered) {
    const g = p.globalId?.trim();
    const ex = expressOf(p);
    if (!g || ex == null) continue;
    for (const k of globalIdLookupKeyVariants(g)) {
      m.set(k, ex);
    }
  }
  return m;
}

/**
 * Cumulative expressIds “placed” by events up to and including `asOfMs` (UTC ms).
 * Events are processed in chronological order. Uses `targetExpressId`, BIM globalIds in the message,
 * and — when the message declares `Elements: N` — fills remaining slots from passports matching
 * IFC type + material slug (deterministic by ascending expressId).
 */
export function cumulativeConstructionExpressIds(
  eventsNewestFirst: readonly TimelineBuildupEvent[],
  passports: readonly Phase4ElementPassport[],
  asOfMs: number
): { expressIds: number[]; eventCountThroughCutoff: number } {
  const globalMap = globalIdToExpressIdMap(passports);
  const byExpress = new Map<number, Phase4ElementPassport>();
  const allExpressSorted: number[] = [];
  for (const p of passports) {
    const id = expressOf(p);
    if (id == null) continue;
    byExpress.set(id, p);
    allExpressSorted.push(id);
  }
  allExpressSorted.sort((a, b) => a - b);

  const chrono = [...eventsNewestFirst]
    .map((e) => ({ e, t: Date.parse(e.timestampIso) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const cumulative = new Set<number>();
  let eventCountThroughCutoff = 0;

  for (const { e, t } of chrono) {
    if (t > asOfMs) break;
    eventCountThroughCutoff += 1;

    const nWant = parseElementsAffectedCount(e.message) ?? 0;
    const fromEvent = new Set<number>();

    if (e.targetExpressId != null && Number.isFinite(e.targetExpressId)) {
      fromEvent.add(Math.floor(e.targetExpressId));
    }
    for (const ex of parseKbElementExpressIdsFromMessage(e.message)) {
      fromEvent.add(ex);
    }
    for (const gid of parseBimGlobalIdsFromMessage(e.message)) {
      const ex = lookupExpressIdForIfcGlobalIdTail(gid, globalMap);
      if (ex != null) fromEvent.add(ex);
    }

    const want = Math.max(nWant, fromEvent.size);
    const typeHint = parseIfcTypeHintFromMessage(e.message);
    const matSlug = materialSlugFromReference(e.materialReference);

    if (fromEvent.size < want && (typeHint || matSlug)) {
      const pool = allExpressSorted.filter(
        (id) => !cumulative.has(id) && !fromEvent.has(id)
      ).filter((id) => {
        const p = byExpress.get(id);
        if (!p) return false;
        const typeOk = typeHint ? passportMatchesTypeHint(p, typeHint) : true;
        const matOk = matSlug ? passportMatchesMaterialSlug(p, matSlug) : true;
        return typeOk && matOk;
      });

      for (const id of pool) {
        if (fromEvent.size >= want) break;
        fromEvent.add(id);
      }
    }

    for (const id of fromEvent) cumulative.add(id);
  }

  return {
    expressIds: [...cumulative].sort((a, b) => a - b),
    eventCountThroughCutoff,
  };
}

/**
 * Provenance sources that stamp events at ingest / “now” rather than project chronology.
 * They are omitted when computing slider bounds so the range runs from the first to the
 * last in-project timestamp (e.g. not pulled out to 2026 by a delivery import audit line).
 */
const TIMELINE_BOUNDS_EXCLUDED_SOURCES = new Set(["form", "deliveries-ingest"]);

export function timelineTimeBoundsMs(
  events: readonly { timestampIso: string; source?: string }[]
): { minMs: number; maxMs: number } | null {
  const chronology = events.filter(
    (e) => !e.source || !TIMELINE_BOUNDS_EXCLUDED_SOURCES.has(e.source)
  );
  const pool = chronology.length > 0 ? chronology : events;
  const ts = pool
    .map((e) => Date.parse(e.timestampIso))
    .filter((n) => Number.isFinite(n));
  if (ts.length === 0) return null;
  return { minMs: Math.min(...ts), maxMs: Math.max(...ts) };
}
