"use client";

import { useMemo } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

const DETAIL_CARD =
  "rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";

type Props = {
  passportsOrdered: Phase4ElementPassport[];
  batchCount: number;
  passportTotal: number;
  elementCountInKb?: number;
  className?: string;
};

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
      ? `${batchCount.toLocaleString()}/${passportTotal.toLocaleString()}`
      : batchCount.toLocaleString();

  const graphBit =
    typeof elementCountInKb === "number"
      ? ` · ${elementCountInKb.toLocaleString()} el`
      : "";

  const line = `${sliceVsKb}${graphBit} · ${stats.uniqueTypes} types · ${stats.epdPct}% EPD · ${stats.withAnyMaterial} mat · ${stats.fireRated} fire`;

  return (
    <section
      className={`${DETAIL_CARD} px-3 py-2 ${className}`.trim()}
      aria-label="Batch stats"
    >
      <p className="font-mono text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {line}
      </p>
    </section>
  );
}
