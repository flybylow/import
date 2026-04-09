"use client";

import { useMemo, type ReactNode } from "react";
import {
  buildLifecycleActorPhaseMatrix,
  lifecycleMatrixEventIconKind,
  lifecycleMatrixEventTitle,
  type LifecycleActorPhaseMatrix,
  type LifecycleMatrixEventIconKind,
  type LifecycleOverviewEvent,
} from "@/lib/timeline-lifecycle-overview";
import { ACTOR_LANE_LABELS } from "@/lib/timeline-actor-lanes";
import { REFERENCE_PHASE_LABELS } from "@/lib/timeline-reference-phase";

const iconBtnClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-500/60 dark:hover:bg-violet-950/50 dark:hover:text-violet-200";

function isoDateShort(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function lifecycleMatrixHoverTitle(ev: LifecycleOverviewEvent): string {
  const full = lifecycleMatrixEventTitle(ev);
  const parts = [
    isoDateShort(ev.timestampIso),
    full,
    `action: ${ev.eventAction}`,
  ];
  const msg = ev.message?.trim();
  if (msg) parts.push(msg.length > 420 ? `${msg.slice(0, 420)}…` : msg);
  return parts.join("\n\n");
}

function SvgIcon(props: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden
    >
      {props.children}
    </svg>
  );
}

function MatrixEventIcon({ kind }: { kind: LifecycleMatrixEventIconKind }) {
  switch (kind) {
    case "document":
      return (
        <SvgIcon>
          <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </SvgIcon>
      );
    case "ifc_model":
      return (
        <SvgIcon>
          <path d="m21 7.5-9-5.25L3 7.5m18 0v9l-9 5.25M21 7.5l-9 5.25m9-5.25v9m-9 5.25V12m0-10.5L12 3m0 0L3 7.5m9 5.25v9m0-9.75v9.75m0-9.75L3 7.5m9 5.25L3 7.5" />
        </SvgIcon>
      );
    case "pipeline":
      return (
        <SvgIcon>
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.37.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </SvgIcon>
      );
    case "milestone":
      return (
        <SvgIcon>
          <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </SvgIcon>
      );
    case "bestek":
      return (
        <SvgIcon>
          <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </SvgIcon>
      );
    case "product":
      return (
        <SvgIcon>
          <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </SvgIcon>
      );
    case "note":
      return (
        <SvgIcon>
          <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        </SvgIcon>
      );
    case "site":
      return (
        <SvgIcon>
          <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </SvgIcon>
      );
    case "evidence":
      return (
        <SvgIcon>
          <path d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.01.447-.027.67A48.11 48.11 0 0 1 12 20.001a48.11 48.11 0 0 1-8.032-.66 6.075 6.075 0 0 0-.027-.67 3 3 0 0 0 4.682-2.72m0-4.001a3 3 0 0 0-4.682-2.72M12 12.75V9.75m0 3h-.008v.008H12V12.75Zm0 0h.008v.008H12V12.75Zm0 0h.008v.008H12V12.75Zm0 0h.008v.008H12V12.75Z" />
        </SvgIcon>
      );
    case "export":
      return (
        <SvgIcon>
          <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </SvgIcon>
      );
    case "compliance":
      return (
        <SvgIcon>
          <path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </SvgIcon>
      );
    case "schedule":
      return (
        <SvgIcon>
          <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5" />
        </SvgIcon>
      );
    case "bcf":
      return (
        <SvgIcon>
          <path d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 12m9.429 2.25L17.25 12m0 0 4.179-2.25M17.25 12l4.179 2.25M17.25 12l-5.571-3m5.571 3-5.571 3" />
        </SvgIcon>
      );
    case "supply":
      return (
        <SvgIcon>
          <path d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.107-8.47m0 0a17.9 17.9 0 0 0-3.59-3.59L9 3.75m0 0L5.25 7.5M9 3.75v6.75" />
        </SvgIcon>
      );
    case "calc":
      return (
        <SvgIcon>
          <path d="M15.75 15.75V18a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v-2.25m11.25 0v1.5a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-1.5m16.5 0V9a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 9v6.75m16.5 0h.008v.008h-.008V15.75Zm-16.5 0h.008v.008h-.008V15.75Zm3-4.875h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm3-6h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm3-6h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm3-6h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
        </SvgIcon>
      );
    case "generic":
    default:
      return (
        <SvgIcon>
          <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </SvgIcon>
      );
  }
}

function LifecycleActorPhaseMatrixTable({
  matrix,
  projectId,
  onOpenEvent,
  preserveLifecycleViewInLinks,
}: {
  matrix: LifecycleActorPhaseMatrix;
  projectId: string;
  onOpenEvent: (eventId: string) => void;
  /** When true, deep links keep `view=lifecycle` (e.g. middle-click / copy link). */
  preserveLifecycleViewInLinks?: boolean;
}) {
  const pid = projectId.trim();
  const colTotals = matrix.columnKeys.map((_, j) =>
    matrix.cells.reduce((sum, row) => sum + (row[j]?.events.length ?? 0), 0)
  );
  const rowTotals = matrix.cells.map((row) =>
    row.reduce((sum, c) => sum + c.events.length, 0)
  );
  const grandTotal = rowTotals.reduce((s, n) => s + n, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <table className="min-w-full border-collapse text-left text-[10px] text-zinc-800 dark:text-zinc-200">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900">
            <th
              className="sticky left-0 z-[1] whitespace-nowrap border-r border-zinc-200 bg-zinc-100 px-2 py-1.5 align-middle font-semibold dark:border-zinc-600 dark:bg-zinc-900"
              scope="col"
            >
              Actor
            </th>
            {matrix.columnKeys.map((key, j) => (
              <th
                key={key}
                className="whitespace-nowrap px-1.5 py-1.5 align-middle font-medium leading-none text-zinc-700 dark:text-zinc-200"
                scope="col"
                title={matrix.columnTitles[j]}
              >
                {key === "unassigned" ? (
                  <span className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                    <span
                      className="shrink-0 rounded bg-zinc-200/90 px-1 py-px font-mono text-[9px] font-normal tabular-nums text-zinc-600 dark:bg-zinc-700/90 dark:text-zinc-300"
                      aria-hidden
                    >
                      —
                    </span>
                    <span className="shrink-0">Unassigned</span>
                  </span>
                ) : (
                  <span className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                    <span
                      className="relative z-0 shrink-0 rounded-md bg-zinc-200/80 px-1.5 py-px font-mono text-[9px] font-normal tabular-nums text-zinc-600 ring-1 ring-zinc-300/80 dark:bg-zinc-800/90 dark:text-zinc-300 dark:ring-zinc-600/80"
                      title={`Phase ${key}`}
                    >
                      {key}
                    </span>
                    <span className="relative z-[1] shrink-0 font-medium">
                      {REFERENCE_PHASE_LABELS[key]}
                    </span>
                  </span>
                )}
              </th>
            ))}
            <th
              className="whitespace-nowrap border-l border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-center align-middle font-semibold tabular-nums dark:border-zinc-600 dark:bg-zinc-900/80"
              scope="col"
            >
              Σ
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rowLanes.map((lane, i) => (
            <tr key={lane} className="border-b border-zinc-100 align-top dark:border-zinc-800">
              <th
                className="sticky left-0 z-[1] border-r border-zinc-200 bg-white px-2 py-1.5 text-left font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                scope="row"
                title={lane}
              >
                {ACTOR_LANE_LABELS[lane]}
              </th>
              {matrix.cells[i]!.map((cell, j) => (
                <td
                  key={matrix.columnKeys[j]}
                  className="max-w-[5rem] min-w-[4rem] border-l border-zinc-50 px-0.5 py-1 align-top dark:border-zinc-800/80"
                >
                  {cell.events.length === 0 ? (
                    <span className="block px-0.5 text-zinc-300 dark:text-zinc-600">—</span>
                  ) : (
                    <ul className="m-0 flex list-none flex-wrap gap-1 p-0.5">
                      {cell.events.map((ev) => {
                        const full = lifecycleMatrixEventTitle(ev);
                        const kind = lifecycleMatrixEventIconKind(ev);
                        const tip = lifecycleMatrixHoverTitle(ev);
                        const label = `${full} — ${isoDateShort(ev.timestampIso)}`;
                        const href = pid
                          ? `/timeline?projectId=${encodeURIComponent(pid)}&eventId=${encodeURIComponent(ev.eventId)}${
                              preserveLifecycleViewInLinks ? "&view=lifecycle" : ""
                            }`
                          : undefined;
                        return (
                          <li key={ev.eventId} className="m-0 block">
                            {href ? (
                              <a
                                href={href}
                                className={iconBtnClass}
                                title={tip}
                                aria-label={label}
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                  e.preventDefault();
                                  onOpenEvent(ev.eventId);
                                }}
                              >
                                <MatrixEventIcon kind={kind} />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenEvent(ev.eventId)}
                                className={iconBtnClass}
                                title={tip}
                                aria-label={label}
                              >
                                <MatrixEventIcon kind={kind} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </td>
              ))}
              <td className="border-l border-zinc-100 bg-zinc-50/80 px-1.5 py-1.5 text-center font-semibold tabular-nums dark:border-zinc-800 dark:bg-zinc-900/50">
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
              <td
                key={matrix.columnKeys[j]}
                className="border-l border-zinc-50 px-1 py-1.5 text-center tabular-nums dark:border-zinc-800/80"
              >
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

type TimelineLifecycleOverviewProps = {
  projectId: string;
  events: LifecycleOverviewEvent[];
  /** Primary click: select event in-page (e.g. show preview) without leaving lifecycle view. */
  onMatrixEventSelect: (eventId: string) => void;
  preserveLifecycleViewInLinks?: boolean;
};

export default function TimelineLifecycleOverview({
  projectId,
  events,
  onMatrixEventSelect,
  preserveLifecycleViewInLinks = false,
}: TimelineLifecycleOverviewProps) {
  const actorPhaseMatrix = useMemo(() => buildLifecycleActorPhaseMatrix(events), [events]);

  return (
    <div className="min-w-0 w-full">
      <section className="mb-4">
        <LifecycleActorPhaseMatrixTable
          matrix={actorPhaseMatrix}
          projectId={projectId}
          onOpenEvent={onMatrixEventSelect}
          preserveLifecycleViewInLinks={preserveLifecycleViewInLinks}
        />
      </section>
    </div>
  );
}
