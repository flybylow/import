import fs from "fs";
import path from "path";

export type ArchitectTaxonomyCategory = {
  id: string;
  label: string;
};

export type ArchitectMaterialTaxonomy = {
  version?: string;
  description?: string;
  categories: ArchitectTaxonomyCategory[];
  dictionarySlugToArchitectCategoryId: Record<string, string>;
};

const TAXONOMY_PATH = path.join(
  process.cwd(),
  "src/data/architect-material-taxonomy.json"
);

export function loadArchitectMaterialTaxonomyFromDisk(): {
  taxonomy: ArchitectMaterialTaxonomy;
  mtimeMs: number;
} {
  const raw = fs.readFileSync(TAXONOMY_PATH, "utf-8");
  const stat = fs.statSync(TAXONOMY_PATH);
  const parsed = JSON.parse(raw) as ArchitectMaterialTaxonomy;
  const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
  const dictionarySlugToArchitectCategoryId =
    parsed.dictionarySlugToArchitectCategoryId &&
    typeof parsed.dictionarySlugToArchitectCategoryId === "object"
      ? parsed.dictionarySlugToArchitectCategoryId
      : {};
  return {
    taxonomy: {
      ...parsed,
      categories,
      dictionarySlugToArchitectCategoryId,
    },
    mtimeMs: stat.mtimeMs,
  };
}

export function labelByArchitectCategoryId(
  taxonomy: ArchitectMaterialTaxonomy,
  categoryId: string
): string {
  const row = taxonomy.categories.find((c) => c.id === categoryId);
  return row?.label ?? categoryId;
}

export function architectCategoryIdForDictionarySlug(
  taxonomy: ArchitectMaterialTaxonomy,
  epdSlug: string
): string | undefined {
  const id = taxonomy.dictionarySlugToArchitectCategoryId[epdSlug];
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
