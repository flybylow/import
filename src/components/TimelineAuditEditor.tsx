"use client";

import type { ReactNode } from "react";

const btnOutline =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 transition-colors disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnPrimary =
  "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";
const btnDangerOutline =
  "rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/40";

export type TimelineAuditEditToolbarProps = {
  /** Shown when not in edit mode — opens add-event UI (e.g. modal). */
  onAddClick: () => void;
  addLabel?: string;
  editMode: boolean;
  onEditModeChange: (next: boolean) => void;
  /** Trailing actions (e.g. Refresh). */
  endSlot?: ReactNode;
  disabled?: boolean;
};

/**
 * Top-right actions: **Add** + **Edit** / **Done**, with an optional trailing slot (e.g. Refresh).
 * Use with {@link TimelineEditModeBanner} and {@link TimelineEventRemoveButton} on rows.
 */
export function TimelineAuditEditToolbar(props: TimelineAuditEditToolbarProps) {
  const {
    onAddClick,
    addLabel = "Add",
    editMode,
    onEditModeChange,
    endSlot,
    disabled = false,
  } = props;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-2.5">
      <button type="button" disabled={disabled} onClick={() => onAddClick()} className={btnPrimary}>
        {addLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onEditModeChange(!editMode)}
        className={btnOutline}
        aria-pressed={editMode}
      >
        {editMode ? "Done" : "Edit"}
      </button>
      {endSlot}
    </div>
  );
}

export type TimelineEditModeBannerProps = {
  projectId: string;
  /** When false, render nothing. */
  visible: boolean;
  onEmptyTimeline: () => void;
  emptyBusy: boolean;
  /** Optional note under the actions. */
  hint?: ReactNode;
};

/**
 * Inline strip when edit mode is on: empty entire log + short API hint.
 */
export function TimelineEditModeBanner(props: TimelineEditModeBannerProps) {
  const { projectId, visible, onEmptyTimeline, emptyBusy, hint } = props;
  if (!visible) return null;
  const pid = projectId.trim();
  return (
    <div
      role="region"
      aria-label="Timeline edit mode"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 dark:border-amber-800/50 dark:bg-amber-950/40"
    >
      <p className="min-w-0 text-xs font-medium text-amber-950 dark:text-amber-100">
        Edit mode — remove events inline, or empty the whole file.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={emptyBusy || !pid}
          onClick={() => onEmptyTimeline()}
          className={btnDangerOutline}
        >
          {emptyBusy ? "Clearing…" : "Empty timeline"}
        </button>
      </div>
      {hint ? (
        <p className="w-full text-[11px] text-amber-900/90 dark:text-amber-200/90">{hint}</p>
      ) : (
        <p className="w-full text-[11px] text-amber-900/80 dark:text-amber-200/80">
          Single removals use{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono dark:bg-amber-900/50">
            POST /api/timeline/delete-events
          </code>
          ; empty uses{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono dark:bg-amber-900/50">
            POST /api/timeline/clear
          </code>
          .
        </p>
      )}
    </div>
  );
}

export type TimelineEventRemoveButtonProps = {
  visible: boolean;
  eventId: string;
  busy: boolean;
  onRemove: (eventId: string) => void;
  /** Stop row/card click from selecting the event. */
  stopPropagation?: boolean;
};

/**
 * Compact remove control for one audit row (list, cards, day stack, preview).
 */
export function TimelineEventRemoveButton(props: TimelineEventRemoveButtonProps) {
  const { visible, eventId, busy, onRemove, stopPropagation = true } = props;
  if (!visible) return null;
  return (
    <button
      type="button"
      disabled={busy}
      title="Remove this event from the timeline file"
      aria-label={`Remove timeline event ${eventId}`}
      onClick={(e) => {
        if (stopPropagation) {
          e.preventDefault();
          e.stopPropagation();
        }
        onRemove(eventId);
      }}
      className="shrink-0 rounded border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/50"
    >
      {busy ? "…" : "Remove"}
    </button>
  );
}
