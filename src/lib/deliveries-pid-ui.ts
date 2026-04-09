/**
 * Deliveries · PID — shared light surfaces (borders, fills, rings).
 * Tune aesthetics in one place; components import these strings.
 */

export type DeliveriesPidSlotStatus = "satisfied" | "missing" | "guidance";

/** Fixed-width horizontal slot card frame (action bar + timeline inspector). */
export const deliveriesPidSlotCardFrame =
  "flex w-[10.25rem] shrink-0 flex-col rounded-md border px-2 py-1.5 sm:w-[11.5rem]";

/** Pastel fill + soft border per checklist state. */
export function deliveriesPidSlotCardClass(status: DeliveriesPidSlotStatus): string {
  switch (status) {
    case "satisfied":
      return "border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20";
    case "missing":
      return "border-amber-200/60 bg-amber-50/50 dark:border-amber-800/35 dark:bg-amber-950/20";
    case "guidance":
      return "border-violet-200/60 bg-violet-50/45 dark:border-violet-800/40 dark:bg-violet-950/20";
  }
}

/** Small “On file” / “To do” / “Hint” tag on slot cards. */
export const deliveriesPidSlotTag =
  "shrink-0 rounded border border-zinc-200/80 bg-white/90 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-zinc-600 shadow-none dark:border-zinc-600/60 dark:bg-zinc-900/50 dark:text-zinc-200";

/** Phase action bar outer shell. */
export const deliveriesPidActionBarShellDeliveries =
  "rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-600/50 dark:bg-zinc-950/45";

export const deliveriesPidActionBarShellTimeline =
  "rounded-md border border-zinc-200/80 bg-zinc-50/80 px-2 py-2 dark:border-zinc-600/50 dark:bg-zinc-900/45";

export const deliveriesPidHairlineDivider = "border-zinc-200/70 dark:border-zinc-700/55";

/** Phase strip (0–9) + “All” — light borders, soft selected ring. */
export function deliveriesPidPhaseStripButtonClass(opts: {
  selected: boolean;
  complete: boolean;
  started: boolean;
  hasSlots: boolean;
}): string {
  const { selected, complete, started, hasSlots } = opts;
  if (selected) {
    return "border-violet-300/85 bg-violet-50/90 text-violet-950 ring-1 ring-violet-300/30 ring-offset-1 ring-offset-white dark:border-violet-500/35 dark:bg-violet-950/35 dark:text-violet-50 dark:ring-violet-500/20 dark:ring-offset-zinc-950";
  }
  if (complete) {
    return "border-emerald-200/85 bg-emerald-50/75 text-emerald-900 dark:border-emerald-700/45 dark:bg-emerald-950/25 dark:text-emerald-100";
  }
  if (started) {
    return "border-amber-200/85 bg-amber-50/75 text-amber-950 dark:border-amber-700/40 dark:bg-amber-950/22 dark:text-amber-100";
  }
  if (hasSlots) {
    return "border-zinc-200/85 bg-white text-zinc-800 dark:border-zinc-600/65 dark:bg-zinc-900/40 dark:text-zinc-100";
  }
  return "border-zinc-200/75 bg-zinc-50/90 text-zinc-500 dark:border-zinc-700/55 dark:bg-zinc-900/38 dark:text-zinc-400";
}

export function deliveriesPidPhaseStripAllButtonClass(selected: boolean): string {
  return selected
    ? "border-violet-300/85 bg-violet-50/90 text-violet-950 ring-1 ring-violet-300/30 ring-offset-1 ring-offset-white dark:border-violet-500/35 dark:bg-violet-950/35 dark:text-violet-50 dark:ring-violet-500/20 dark:ring-offset-zinc-950"
    : "border-zinc-200/85 bg-zinc-50/85 text-zinc-600 dark:border-zinc-600/65 dark:bg-zinc-900/40 dark:text-zinc-300";
}

/** Inspector badge (Matched / Missing / Mock) — matches slot pastels. */
export function deliveriesPidInspectorBadgeClass(status: DeliveriesPidSlotStatus): string {
  switch (status) {
    case "satisfied":
      return "border-emerald-200/70 bg-emerald-50/60 text-emerald-900 dark:border-emerald-800/35 dark:bg-emerald-950/28 dark:text-emerald-100";
    case "missing":
      return "border-amber-200/70 bg-amber-50/60 text-amber-900 dark:border-amber-800/30 dark:bg-amber-950/22 dark:text-amber-100";
    case "guidance":
      return "border-violet-200/70 bg-violet-50/55 text-violet-950 dark:border-violet-800/35 dark:bg-violet-950/25 dark:text-violet-100";
  }
}

/** PID dossier checklist summary panel + inner table. */
export const deliveriesPidChecklistSummaryShell =
  "rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-600/50 dark:bg-zinc-950/40";

export const deliveriesPidChecklistTableWrap =
  "mt-2 max-h-[min(22rem,55vh)] overflow-auto rounded border border-zinc-200/70 bg-zinc-50/25 dark:border-zinc-700/50 dark:bg-zinc-950/28";

export const deliveriesPidChecklistTableHeader =
  "sticky top-0 z-[1] bg-zinc-100/90 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 backdrop-blur-[2px] dark:bg-zinc-900/90 dark:text-zinc-400";

export const deliveriesPidChecklistTableRowBorder = "border-b border-zinc-100/90 dark:border-zinc-800/80";

export function deliveriesPidChecklistStatusTextClass(status: DeliveriesPidSlotStatus): string {
  switch (status) {
    case "satisfied":
      return "text-emerald-800/95 dark:text-emerald-200/95";
    case "missing":
      return "text-amber-800/95 dark:text-amber-200/95";
    case "guidance":
      return "text-zinc-500 dark:text-zinc-400";
  }
}

export const deliveriesPidChecklistRowHover =
  "hover:bg-zinc-50/90 dark:hover:bg-zinc-900/35";

/** Milestone cards in PID dossier horizontal bands. */
export const deliveriesPidMilestoneCardOuter =
  "flex w-[10.25rem] shrink-0 overflow-hidden rounded-lg border border-zinc-200/80 shadow-sm dark:border-zinc-600/50 sm:w-[11.5rem]";

export const deliveriesPidMilestoneCardInner = "flex min-w-0 flex-1 flex-col bg-white p-2 dark:bg-zinc-950/50";

/** Small event cards (e.g. “After last PID milestone”). */
export const deliveriesPidCompactEventCard =
  "flex w-[10.25rem] shrink-0 flex-col rounded-lg border border-zinc-200/80 bg-zinc-50/45 p-2 dark:border-zinc-600/50 dark:bg-zinc-900/32 sm:w-[11.5rem]";
