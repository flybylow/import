"use client";

import { useMemo } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

const DETAIL_CARD =
  "rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";

const BAR_MAX_TYPES = 14;

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
 * Compact, readable summary of a passport batch: coverage vs KB, EPD / fire-rated counts,
 * and top IFC types as horizontal bars (no force-graph — stays fast with large batches).
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
    const typesSorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const topTypes = typesSorted.slice(0, BAR_MAX_TYPES);
    const maxCount = topTypes[0]?.[1] ?? 1;
    const epdPct =
      batchCount > 0 ? Math.round((100 * withEpdMaterial) / batchCount) : 0;
    return {
      uniqueTypes: byType.size,
      topTypes,
      maxCount,
      withEpdMaterial,
      withAnyMaterial,
      fireRated,
      epdPct,
      moreTypes: Math.max(0, typesSorted.length - topTypes.length),
    };
  }, [passportsOrdered, batchCount]);

  const sliceVsKb =
    passportTotal > 0
      ? `${batchCount.toLocaleString()} / ${passportTotal.toLocaleString()} passports in KB`
      : `${batchCount.toLocaleString()} passports in this response`;

  return (
    <div className={`flex w-full flex-col ${DETAIL_CARD} ${className}`.trim()}>
      <header className="shrink-0 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
          Passport overview
        </h2>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          Counts for this loaded batch — not a node graph. Use the list to pick an element; bars show
          where most passports sit by IFC type.
        </p>
      </header>
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

        <div className="border-t border-zinc-200/80 pt-2 dark:border-zinc-800">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Top IFC types in this batch
          </div>
          <ul className="space-y-1.5" aria-label="IFC type distribution">
            {stats.topTypes.map(([name, count]) => {
              const w = Math.max(4, Math.round((100 * count) / stats.maxCount));
              return (
                <li key={name} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-[10px]">
                    <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200" title={name}>
                      {name}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      {count.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-800"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full bg-violet-500/85 dark:bg-violet-500/70"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {stats.moreTypes > 0 ? (
            <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
              +{stats.moreTypes} more type{stats.moreTypes === 1 ? "" : "s"} with fewer instances…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
