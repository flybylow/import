"use client";

import Link from "next/link";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";
import { isMeaningfulIfcFireRating } from "@/lib/compliance-pilot";

type Props = {
  projectId: string;
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
  selectedMissingFromPassportBatch: boolean;
};

/**
 * IFC fire rating from the KB with provenance context.
 * Used on `/bim/passport-snapshot` (linked from Passports finder preview), not in the Passports viewer.
 */
export function PassportFireSnapshot(props: Props) {
  const { projectId, passport, selectedExpressId, selectedMissingFromPassportBatch } =
    props;

  if (selectedExpressId == null) {
    return (
      <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        Select an element to see how fire rating is stored for it in the KB.
      </p>
    );
  }

  if (selectedMissingFromPassportBatch) {
    return (
      <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-100">
        No passport row in this slice — fire rating from KB is unavailable here.{" "}
        <Link
          href={`/bim?projectId=${encodeURIComponent(projectId)}&view=building`}
          className="font-medium underline"
        >
          Building
        </Link>
      </p>
    );
  }

  if (!passport) {
    return null;
  }

  const raw = passport.ifcFireRating?.trim() ?? "";
  const meaningful = isMeaningfulIfcFireRating(passport.ifcFireRating);

  return (
    <div className="space-y-3 text-[11px] leading-snug">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {raw ? raw : "—"}
        </p>
        {!raw ? (
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            No value on this element in the KB. The importer only stores a rating when the IFC carries a
            corresponding property (often <code className="rounded bg-zinc-100 px-0.5 font-mono text-[10px] dark:bg-zinc-900">FireRating</code> on a type-specific Pset).
          </p>
        ) : !meaningful ? (
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            Present but treated as non-rated in checks (e.g. “Geen”, “none”, “n/a”).
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-2 text-[10px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
        <p>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Provenance:</span> Phase 1
          enrichment reads IFC property sets and writes{" "}
          <code className="rounded bg-zinc-100 px-0.5 font-mono dark:bg-zinc-900">ont:fireRating</code>{" "}
          on the element node in the KB. It is the same string exposed as{" "}
          <code className="rounded bg-zinc-100 px-0.5 font-mono dark:bg-zinc-900">ifcFireRating</code> in
          the passport API — not computed from materials or EPDs.
        </p>
        <p className="mt-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">IFC side:</span> Typical sources
          include <code className="font-mono">Pset_WallCommon</code>,{" "}
          <code className="font-mono">Pset_DoorCommon</code>,{" "}
          <code className="font-mono">Pset_WindowCommon</code>, etc., depending on element type.
        </p>
      </div>

      {passport.sameNameElementCount != null && passport.sameNameElementCount > 1 ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">KB note:</span>{" "}
          <code className="font-mono">{passport.sameNameElementCount}</code> elements in this loaded batch
          share the same display name (API dedupe context).
        </p>
      ) : null}
    </div>
  );
}
