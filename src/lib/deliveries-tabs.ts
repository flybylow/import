/**
 * Canonical `/deliveries?tab=` values and legacy aliases (shareable URLs vs old bookmarks).
 */

export type DeliveriesTabId = "ingest" | "specification" | "pid";

/** Query string value for `tab=` (same as id). */
export function deliveriesTabQueryValue(id: DeliveriesTabId): string {
  return id;
}

/**
 * Resolve `tab=` from the URL to a canonical id. Unknown values fall back to `ingest`.
 *
 * Aliases:
 * - `ingest`: `flow`, `leveringsbon`, `delivery`, `deliveries`
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
    t === "deliveries"
  ) {
    return "ingest";
  }
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
