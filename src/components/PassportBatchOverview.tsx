"use client";

import { useMemo } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

const DETAIL_CARD =
  "rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";

type Props = {
  passportsOrdered: Phase4ElementPassport[];
  /** Rows in this API batch (often ≤ 50k). */
  batchCount: number;
  /** Total passport rows reported by KB (`elementPassportTotal`). */
  passportTotal: number;
  /** IFC element nodes in KB graph (`elementCount`), if known. */
  elementCountInKb?: number;
  className?: string;
};

/**
 * Batch stats (collapsed by default). IFC-type distribution is in the finder — not duplicated here.
 */
export default function PassportBatchOverview({
  passportsOrdered,
  batchCount,
  passportTotal,
  elementCountInKb,
  className = "",
}: Props) {
  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    let withEpdMaterial = 0;
    let withAnyMaterial = 0;
    let fireRated = 0;
    for (const p of passportsOrdered) {
      const t = p.ifcType?.trim() || "Unknown";
      byType.set(t, (byType.get(t) ?? 0) + 1);
      const mats = p.materials ?? [];
      if (mats.length > 0) withAnyMaterial += 1;
      if (mats.some((m) => m.hasEPD)) withEpdMaterial += 1;
      if (p.ifcFireRating?.trim()) fireRated += 1;
    }
    const epdPct =
      batchCount > 0 ? Math.round((100 * withEpdMaterial) / batchCount) : 0;
    return {
      uniqueTypes: byType.size,
      withEpdMaterial,
      withAnyMaterial,
      fireRated,
      epdPct,
    };
  }, [passportsOrdered, batchCount]);

  const sliceVsKb =
    passportTotal > 0
      ? `${batchCount.toLocaleString()} / ${passportTotal.toLocaleString()} passports in KB`
      : `${batchCount.toLocaleString()} passports in this response`;

  const summaryBits = [
    `${batchCount.toLocaleString()} in batch`,
    `${stats.uniqueTypes} IFC types`,
    `${stats.epdPct}% EPD-linked`,
  ].join(" · ");

  return (
    <details
      className={`group flex w-full flex-col ${DETAIL_CARD} ${className}`.trim()}
    >
      <summary className="cursor-pointer list-none border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
            Batch overview
          </h2>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{summaryBits}</span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-violet-700 dark:text-violet-300 group-open:hidden">
            Show batch stats
          </span>
          <span className="hidden font-medium text-violet-700 dark:text-violet-300 group-open:inline">
            Hide batch stats
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {" "}
            — batch-only; browse types in Elements.
          </span>
        </p>
      </summary>
      <div className="space-y-2 px-3 py-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] leading-tight text-zinc-700 dark:text-zinc-300">
          <dt className="text-zinc-500 dark:text-zinc-500">Batch</dt>
          <dd className="font-mono">{sliceVsKb}</dd>
          {typeof elementCountInKb === "number" ? (
            <>
              <dt className="text-zinc-500">KB graph</dt>
              <dd className="font-mono">
                {elementCountInKb.toLocaleString()} IFC elements
              </dd>
            </>
          ) : null}
          <dt className="text-zinc-500">IFC types</dt>
          <dd className="font-mono">{stats.uniqueTypes} distinct in batch</dd>
          <dt className="text-zinc-500">EPD link</dt>
          <dd className="font-mono">
            {stats.withEpdMaterial.toLocaleString()} elements ({stats.epdPct}%) with ≥1 material
            linked to an EPD
          </dd>
          <dt className="text-zinc-500">Materials</dt>
          <dd className="font-mono">
            {stats.withAnyMaterial.toLocaleString()} with ≥1 material row
          </dd>
          <dt className="text-zinc-500">Fire-rated</dt>
          <dd className="font-mono">
            {stats.fireRated.toLocaleString()} with{" "}
            <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-900">ifcFireRating</code>
          </dd>
        </dl>
      </div>
    </details>
  );
}
