import type { UnmatchedMaterialRowKind } from "@/lib/material-unmatched-diagnostics";

/** Tailwind classes for the compact “Kind” pill on unmatched material rows. */
export function unmatchedRowKindBadgeClass(kind: UnmatchedMaterialRowKind): string {
  switch (kind) {
    case "hatch_annotation":
      return "bg-zinc-200/90 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100";
    case "material_list_no_name":
      return "bg-violet-200/80 text-violet-950 dark:bg-violet-900/55 dark:text-violet-100";
    case "placeholder_ifc":
      return "bg-amber-200/75 text-amber-950 dark:bg-amber-900/45 dark:text-amber-100";
    case "no_source_match":
    default:
      return "bg-sky-200/65 text-sky-950 dark:bg-sky-900/45 dark:text-sky-100";
  }
}
