import availableEpds from "@/data/available-epds.json";

export type AvailableEpdEntry = {
  epdSlug: string;
  epdName: string;
  /** Optional human grouping for the static list (product family — not IFC row “Kind”). */
  category?: string;
};

type FileShape = {
  version: string;
  epds: AvailableEpdEntry[];
};

/**
 * Static catalog for manual EPD dropdowns — loaded from `src/data/available-epds.json`,
 * not from per-project KB TTL (so the menu does not change when the graph changes).
 */
export function getAvailableEpdsCatalog(): AvailableEpdEntry[] {
  const raw = availableEpds as FileShape;
  const list = raw.epds ?? [];
  return [...list].sort((a, b) => a.epdSlug.localeCompare(b.epdSlug));
}
