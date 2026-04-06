"use client";

import { useEffect, useState } from "react";
import KbGraphGroupedByEpd from "@/components/KbGraphGroupedByEpd";
import KbGraphOutlineSvg from "@/components/KbGraphOutlineSvg";
import KbGraphWithInspector from "@/components/KbGraphWithInspector";
import type { KBGraph } from "@/lib/kb-store-queries";

export type KbVizMode = "force" | "grouped" | "outline";

export default function KbGraphVisualization(props: {
  kbGraph: KBGraph;
  /** From `/kb?expressId=` — opens force view and zooms the matching element node. */
  focusExpressId?: number;
  /** From `/kb?focusMaterialId=` — opens force view and zooms the material node. */
  focusMaterialId?: number;
}) {
  const { kbGraph, focusExpressId, focusMaterialId } = props;
  const [mode, setMode] = useState<KbVizMode>("grouped");

  useEffect(() => {
    if (focusExpressId != null && Number.isFinite(focusExpressId)) {
      setMode("force");
      return;
    }
    if (focusMaterialId != null && Number.isFinite(focusMaterialId)) {
      setMode("force");
    }
  }, [focusExpressId, focusMaterialId]);

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Knowledge graph view"
      >
        {(
          [
            ["grouped", "Grouped by EPD"],
            ["force", "Force graph"],
            ["outline", "Hub outline"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={
              mode === id
                ? "rounded-md px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-md px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "force" ? (
        <KbGraphWithInspector
          kbGraph={kbGraph}
          focusExpressId={focusExpressId}
          focusMaterialId={focusMaterialId}
        />
      ) : null}
      {mode === "grouped" ? (
        <KbGraphGroupedByEpd kbGraph={kbGraph} />
      ) : null}
      {mode === "outline" ? (
        <KbGraphOutlineSvg kbGraph={kbGraph} />
      ) : null}
    </div>
  );
}
