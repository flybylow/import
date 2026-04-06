import type { Phase4PassportMaterial } from "@/lib/phase4-passports";

/** Passports tab with this element selected (full passport UI). Optional `group` = finder bucket (`?group=`, e.g. `IfcBeam` or `IfcCovering · CEILING`). */
export function bimPassportsElementHref(
  projectId: string,
  expressId: number,
  groupKey?: string,
  opts?: { from?: string }
): string {
  const q = new URLSearchParams();
  q.set("projectId", projectId);
  q.set("view", "passports");
  q.set("expressId", String(expressId));
  const g = groupKey?.trim();
  if (g) q.set("group", g);
  const from = opts?.from?.trim();
  if (from) q.set("from", from);
  return `/bim?${q.toString()}`;
}

/** Passports tab: group (IFC type) only, no element — 3D highlights the whole group. */
export function bimPassportsGroupHref(projectId: string, groupKey: string): string {
  return `/bim?projectId=${encodeURIComponent(projectId)}&view=passports&group=${encodeURIComponent(groupKey.trim())}`;
}

/** Phase 4 Building IFC viewer with focus expressId. */
export function bimBuildingElementHref(projectId: string, expressId: number): string {
  return `/bim?projectId=${encodeURIComponent(projectId)}&view=building&expressId=${encodeURIComponent(String(expressId))}`;
}

/** Phase 2 KB UI: graph + element node (see `src/app/kb/page.tsx` `expressId` param). */
export function kbGraphElementHref(projectId: string, expressId: number): string {
  return `/kb?projectId=${encodeURIComponent(projectId)}&expressId=${encodeURIComponent(String(expressId))}`;
}

/**
 * Phase 2 KB: scroll/highlight unmatched row when applicable (`focusMaterialId` / `materialId`).
 */
export function kbFocusMaterialHref(projectId: string, materialId: number): string {
  return `/kb?projectId=${encodeURIComponent(projectId)}&focusMaterialId=${encodeURIComponent(String(materialId))}`;
}

export type PassportEpdLink = {
  href: string;
  label: string;
  /** Open in new tab (external http(s)). */
  external?: boolean;
};

/**
 * EPD navigation from passport material rows (no extra fetch).
 *
 * **Today:** `ont:sourceProductUri` when http(s) (programme / product record where the dataset points), and
 * `ont:sourceFileName` → same-origin `/api/file` when the importer stored a path under `data/`.
 *
 * **Next steps (proposal):**
 * 1. **`/materials/epd` page** — `?slug=&identifier=` renders registry metadata + GWP snapshot from a small API
 *    (or client read of a static index), stable bookmark for “this EPD in our system”.
 * 2. **Slug → programme URL map** — e.g. `b-epd-*` → Belgian programme search, `epd-nl-*` → NL register, using
 *    a config table so we do not hard-code fragile third-party URL patterns in UI code.
 * 3. **Environdec / EC3** — if we store programme UUID or EC3 ID on the EPD node, link directly; registration
 *    numbers alone are ambiguous across programmes.
 */
export function passportMaterialEpdLinks(
  m: Pick<Phase4PassportMaterial, "sourceProductUri" | "sourceFileName">
): PassportEpdLink[] {
  const out: PassportEpdLink[] = [];
  const uri = m.sourceProductUri?.trim();
  if (uri && /^https?:\/\//i.test(uri)) {
    out.push({
      href: uri,
      label: "Original programme record",
      external: true,
    });
  }
  const fn = m.sourceFileName?.trim();
  if (fn) {
    out.push({
      href: `/api/file?name=${encodeURIComponent(fn)}`,
      label: "Imported source file",
      external: false,
    });
  }
  return out;
}
