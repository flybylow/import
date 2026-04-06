import fs from "fs";
import path from "path";

export type MaterialLabelTranslationRow = {
  epdSlug: string;
  en: string;
  nl: string;
  /**
   * When `material-dictionary.json` has several rows with the same `epdSlug`, pick this row by
   * matching dictionary `standardName` exactly.
   */
  standardNameEn?: string;
};

export type MaterialLabelTranslationsFile = {
  version?: string;
  description?: string;
  locale?: string;
  /** e.g. architect_display — future: contractor_display, per-tenant packs */
  role?: string;
  translations: MaterialLabelTranslationRow[];
};

const TRANSLATIONS_PATH = path.join(
  process.cwd(),
  "src/data/material-label-translations.json"
);

export function materialLabelTranslationsPath(cwd = process.cwd()): string {
  return path.join(cwd, "src/data/material-label-translations.json");
}

export function loadMaterialLabelTranslationsFromDisk(cwd = process.cwd()): {
  file: MaterialLabelTranslationsFile;
  mtimeMs: number;
} {
  const p = materialLabelTranslationsPath(cwd);
  const raw = fs.readFileSync(p, "utf-8");
  const stat = fs.statSync(p);
  const parsed = JSON.parse(raw) as MaterialLabelTranslationsFile;
  const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
  return {
    file: { ...parsed, translations },
    mtimeMs: stat.mtimeMs,
  };
}

/**
 * Resolve the NL label for a dictionary row (`epdSlug` + English `standardName` from the dictionary).
 */
export function nlLabelForDictionaryEntry(
  epdSlug: string,
  standardName: string,
  cwd = process.cwd()
): string | undefined {
  const { file } = loadMaterialLabelTranslationsFromDisk(cwd);
  const slug = epdSlug.trim();
  const std = standardName.trim();
  const candidates = file.translations.filter((t) => t.epdSlug.trim() === slug);
  if (candidates.length === 0) return undefined;

  const withStd = candidates.filter((t) => (t.standardNameEn ?? "").trim());
  if (withStd.length > 0) {
    const hit = withStd.find((t) => (t.standardNameEn ?? "").trim() === std);
    return hit?.nl.trim() || undefined;
  }

  if (candidates.length === 1) {
    return candidates[0].nl.trim() || undefined;
  }

  const byEn = candidates.find((t) => (t.en ?? "").trim() === std);
  return byEn?.nl.trim() || undefined;
}
