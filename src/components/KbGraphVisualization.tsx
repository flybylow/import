"use client";

import { useState } from "react";
import KbGraphGroupedByEpd from "@/components/KbGraphGroupedByEpd";
import KbGraphOutlineSvg from "@/components/KbGraphOutlineSvg";
import KbGraphWithInspector from "@/components/KbGraphWithInspector";

type KBGraph = {
  materials: Array<{
    materialId: number;
    materialName: string;
    hasEPD: boolean;
    epdSlug?: string;
    matchType?: string;
    matchConfidence?: number;
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

export type KbVizMode = "force" | "grouped" | "outline";

export default function KbGraphVisualization(props: { kbGraph: KBGraph }) {
  const { kbGraph } = props;
  const [mode, setMode] = useState<KbVizMode>("force");

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Knowledge graph view"
      >
        {(
          [
            ["force", "Force graph"],
            ["grouped", "Grouped by EPD"],
            ["outline", "Hub outline (SVG)"],
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
        <KbGraphWithInspector kbGraph={kbGraph} />
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
