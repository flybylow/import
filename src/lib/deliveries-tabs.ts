/**
 * Canonical `/deliveries?tab=` values and legacy aliases (shareable URLs vs old bookmarks).
 */

export type DeliveriesTabId = "ingest" | "specification" | "pid";

/** Query string value for `tab=` (same as id). */
export function deliveriesTabQueryValue(id: DeliveriesTabId): string {
  return id;
}

/**
 * Resolve `tab=` from the URL to a canonical id.
 * Missing or empty `tab` defaults to `specification` (Bestek / opmeting — shareable document view).
 * Unknown non-empty values fall back to `ingest` (legacy safety for odd bookmarks).
 *
 * Aliases:
 * - `ingest`: `flow`, `leveringsbon`, `delivery`, `deliveries`, `werf`
 * - `specification`: `bestek`, `spec`
 * - `pid`: `lifecycle`, `process`
 */
export function deliveriesTabFromQueryParam(raw: string | null | undefined): DeliveriesTabId {
  const t = raw?.trim().toLowerCase() ?? "";
  if (t === "specification" || t === "bestek" || t === "spec") return "specification";
  if (t === "pid" || t === "lifecycle" || t === "process") return "pid";
  if (
    t === "ingest" ||
    t === "flow" ||
    t === "leveringsbon" ||
    t === "delivery" ||
    t === "deliveries" ||
    t === "werf"
  ) {
    return "ingest";
  }
  if (t === "") return "specification";
  return "ingest";
}

/**
 * Whether to open the saved specification / opmeting fiche block expanded.
 * Canonical: `specificationFiche=1`. Legacy: `bestekFiche=1`.
 */
export function deliveriesOpenSavedSpecificationFiche(sp: {
  get: (key: string) => string | null;
}): boolean {
  return (
    sp.get("specificationFiche") === "1" ||
    sp.get("bestekFiche") === "1"
  );
}

/**
 * Leveringsbon · werf — expand the **Live preview (JSON)** collapsible.
 * Canonical: `ingestPreview=1` (with `?tab=ingest`).
 */
export function deliveriesIngestLivePreviewOpen(sp: {
  get: (key: string) => string | null;
}): boolean {
  return sp.get("ingestPreview") === "1";
}
