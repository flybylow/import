"use client";

import { Fragment, useState } from "react";

import TruncatedWithTooltip from "@/components/TruncatedWithTooltip";
import type { MaterialCalcGroup } from "@/lib/calculate-material-groups";

type Props = {
  groups: MaterialCalcGroup[];
  /** Tighter layout for Step 4 card */
  compact?: boolean;
};

export default function MaterialCalcGroupList({ groups, compact }: Props) {
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);

  if (!groups.length) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">No rows.</p>;
  }

  const th = compact ? "py-1 px-2 text-[10px]" : "py-1.5 px-2 text-[11px]";
  const td = compact ? "py-1 px-2 text-[11px]" : "py-1.5 px-2 text-[13px]";

  return (
    <div
      className={`rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden ${
        compact ? "text-xs" : ""
      }`}
    >
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col className="min-w-0 w-[45%]" />
          <col className="w-[22%]" />
          <col className="w-[11%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead>
          <tr className="text-left text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800">
            <th className={`${th} font-medium`}>Material</th>
            <th className={`${th} font-medium whitespace-nowrap`}>EPD</th>
            <th className={`${th} font-medium text-right whitespace-nowrap`}>
              IFC materials
            </th>
            <th className={`${th} font-medium text-right whitespace-nowrap`}>kgCO2e</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = openGroupKey === g.groupKey;
            return (
              <Fragment key={g.groupKey}>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 align-middle">
                  <td className={`${td} font-medium text-zinc-900 dark:text-zinc-100 max-w-0`}>
                    <span className="block truncate whitespace-nowrap" title={g.humanLabel}>
                      {g.humanLabel}
                    </span>
                  </td>
                  <td className={`${td} text-[11px] text-zinc-700 dark:text-zinc-300`}>
                    <span className="block truncate whitespace-nowrap" title={g.epdName}>
                      {g.epdName}
                    </span>
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums text-zinc-800 dark:text-zinc-100`}>
                    {g.ifcMaterialCount}
                  </td>
                  <td className={`${td} text-right align-middle`}>
                    <div className="flex flex-nowrap items-center justify-end gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-100 shrink-0">
                        {g.totalKgCO2e.toFixed(3)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-left text-[11px] text-zinc-600 dark:text-zinc-400 underline decoration-zinc-400/80 hover:text-zinc-900 dark:hover:text-zinc-100"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenGroupKey((k) => (k === g.groupKey ? null : g.groupKey))
                        }
                      >
                        materials
                      </button>
                    </div>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
                    <td colSpan={4} className="p-0">
                      <div className="px-2 py-2 sm:px-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 overflow-x-auto">
                        <table className="w-full min-w-[20rem] text-[11px] border-collapse">
                          <thead>
                            <tr className="text-left text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                              <th className="py-1 pr-2 font-medium">IFC expressId</th>
                              <th className="py-1 pr-2 font-medium">kgCO2e</th>
                              <th className="py-1 pr-2 font-medium">Elements</th>
                              <th className="py-1 font-medium">Qty (compact)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.lines.map((line, idx) => (
                              <tr
                                key={`${g.groupKey}-${line.ifcMaterialExpressId ?? idx}`}
                                className="border-b border-zinc-50 dark:border-zinc-900 align-top"
                              >
                                <td className="py-1 pr-2 font-mono whitespace-nowrap">
                                  {line.ifcMaterialExpressId ?? "—"}
                                </td>
                                <td className="py-1 pr-2 font-mono whitespace-nowrap">
                                  {Number(line.kgCO2e).toFixed(3)}
                                </td>
                                <td className="py-1 pr-2 font-mono whitespace-nowrap">
                                  {line.elementCount ?? "—"}
                                </td>
                                <td className="py-1 max-w-[min(24rem,55vw)]">
                                  <TruncatedWithTooltip value={line.compactQuantities} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {g.lines.some((l) => l.calculationNote) ? (
                          <div className="mt-2 text-[10px] text-amber-800 dark:text-amber-300 space-y-0.5">
                            {g.lines.map((line, idx) =>
                              line.calculationNote ? (
                                <div key={`note-${idx}`}>
                                  expressId {line.ifcMaterialExpressId ?? "?"}:{" "}
                                  {line.calculationNote}
                                </div>
                              ) : null
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
