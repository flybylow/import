export type ElementGroup = {
  group_id: string;
  ifc_type: string;
  /**
   * Sub-bucket for coarse IFC classes partitioned in passports/Bestek (e.g. `IfcCovering` → `betontegels`, `CEILING`).
   * Omitted or null when the class is not partitioned or no suffix was derived.
   */
  partition?: string | null;
  element_count: number;
  element_ids: string[];
  created_at: string;
  architect_name?: string | null;
};

export type BestekBinding = {
  group_id: string;
  architect_name: string;
  /** Optional: EPD slug from `src/data/material-dictionary.json` (architect pick from Bestek Dictionary). */
  material_slug?: string;
  /** Optional verbatim trade / product names from the spec (comma-separated in UI). */
  approved_brands?: string[];
  or_equivalent?: boolean;
  /** Architect bestek article number (Art. / opmetingsstaat). */
  article_number?: string;
  /** Measurement / order unit for the article line (e.g. m², m³, st, kg). */
  article_unit?: string;
  /** Opmetingsstaat quantity (string so values like `124,5` stay as typed). */
  article_quantity?: string;
  created_by: string;
  created_at: string;
};

export type ProductCouplingRow = {
  group_id: string;
  product_label?: string;
  epd_slug?: string;
  notes?: string;
};

export type ProductCouplingFile = {
  updated_at: string;
  updated_by: string;
  couplings: ProductCouplingRow[];
};

/** Architect-only IFC-type → dictionary slug (+ notes). See `/deliveries/match-materials`. */
export type BestekArchitectMaterialMatching = {
  group_id: string;
  ifc_type: string;
  element_count: number;
  /** Empty when not applicable (e.g. IfcSpace) or not yet chosen */
  material_slug: string;
  notes?: string;
  created_by: string;
  created_at: string;
};
