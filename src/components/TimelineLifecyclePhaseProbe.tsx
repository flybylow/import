"use client";

import { useMemo } from "react";
import {
  buildLifecyclePhaseActionMatrix,
  type LifecycleOverviewEvent,
  type LifecyclePhaseActionMatrix,
} from "@/lib/timeline-lifecycle-overview";
import {
  TIMELINE_EVENT_LABELS,
  isTimelineEventAction,
  type TimelineEventAction,
} from "@/lib/timeline-events-vocab";

function actionColumnTitle(action: string): string {
  if (isTimelineEventAction(action)) {
    return TIMELINE_EVENT_LABELS[action as TimelineEventAction];
  }
  return action;
}

function actionColumnHeaderText(action: string): string {
  const full = actionColumnTitle(action);
  return full.length > 22 ? `${full.slice(0, 20)}…` : full;
}

function LifecycleProbeMatrix({ matrix }: { matrix: LifecyclePhaseActionMatrix }) {
  if (matrix.columnActions.length === 0) {
    return <p className="text-[12px] text-zinc-500 dark:text-zinc-400">No events — empty matrix.</p>;
  }

  const colTotals = matrix.columnActions.map((_, j) =>
    matrix.grid.reduce((sum, row) => sum + (row[j] ?? 0), 0)
  );
  const rowTotals = matrix.grid.map((row) => row.reduce((sum, c) => sum + c, 0));
  const grandTotal = rowTotals.reduce((s, n) => s + n, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <table className="min-w-full border-collapse text-left text-[10px] text-zinc-800 dark:text-zinc-200">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900">
            <th
              className="sticky left-0 z-[1] border-r border-zinc-200 bg-zinc-100 px-2 py-1.5 font-semibold dark:border-zinc-600 dark:bg-zinc-900"
              scope="col"
            >
              Phase (row)
            </th>
            {matrix.columnActions.map((a) => (
              <th
                key={a}
                className="max-w-[5.5rem] px-1 py-1.5 align-bottom font-medium leading-tight text-zinc-600 dark:text-zinc-400"
                scope="col"
                title={`${a} — ${actionColumnTitle(a)}`}
              >
                <span className="line-clamp-3 break-words">{actionColumnHeaderText(a)}</span>
              </th>
            ))}
            <th
              className="border-l border-zinc-200 bg-zinc-50 px-1.5 py-1.5 font-semibold tabular-nums dark:border-zinc-600 dark:bg-zinc-900/80"
              scope="col"
            >
              Σ
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rowLabels.map((row, i) => (
            <tr
              key={row.phase}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <th
                className="sticky left-0 z-[1] border-r border-zinc-200 bg-white px-2 py-1 text-left font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                scope="row"
              >
                {row.shortLabel}
              </th>
              {matrix.grid[i]!.map((c, j) => (
                <td
                  key={matrix.columnActions[j]}
                  className={`px-1 py-1 text-center tabular-nums ${
                    c === 0 ? "text-zinc-300 dark:text-zinc-600" : ""
                  }`}
                >
                  {c === 0 ? "·" : c}
                </td>
              ))}
              <td className="border-l border-zinc-100 bg-zinc-50/80 px-1.5 py-1 text-center font-semibold tabular-nums dark:border-zinc-800 dark:bg-zinc-900/50">
                {rowTotals[i]}
              </td>
            </tr>
          ))}
          <tr className="border-t border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-600 dark:bg-zinc-900/80">
            <th
              className="sticky left-0 z-[1] border-r border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left dark:border-zinc-600 dark:bg-zinc-900/80"
              scope="row"
            >
              Σ
            </th>
            {colTotals.map((t, j) => (
              <td key={matrix.columnActions[j]} className="px-1 py-1.5 text-center tabular-nums">
                {t === 0 ? "·" : t}
              </td>
            ))}
            <td className="border-l border-zinc-200 px-1.5 py-1.5 text-center tabular-nums dark:border-zinc-600">
              {grandTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

type TimelineLifecyclePhaseProbeProps = {
  events: LifecycleOverviewEvent[];
};

/** Dense phase × eventAction matrix — used at the bottom of the lifecycle timeline page. */
export default function TimelineLifecyclePhaseProbe({ events }: TimelineLifecyclePhaseProbeProps) {
  const phaseActionMatrix = useMemo(() => buildLifecyclePhaseActionMatrix(events), [events]);

  return (
    <section
      className="shrink-0 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      aria-label="Phase × eventAction probe"
    >
      <details
        className="group rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/30"
        open={false}
      >
        <summary className="cursor-pointer list-none px-2 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Phase × eventAction
          </span>
          <span className="ml-2 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
            (dense probe — click to expand)
          </span>
        </summary>
        <div className="border-t border-zinc-200 px-1 pb-2 pt-2 dark:border-zinc-800">
          <LifecycleProbeMatrix matrix={phaseActionMatrix} />
        </div>
      </details>
    </section>
  );
}
