"use client";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  /** Visible label text when `showLabel` is true. Default "projectId". */
  label?: string;
  /** When false, no visible label (input uses aria-label). Default true. */
  showLabel?: boolean;
  /** Toolbar-style single row, smaller type (e.g. Deliveries Bestek header). */
  compact?: boolean;
};

export default function ProjectIdField(props: Props) {
  const {
    value,
    onChange,
    readOnly,
    disabled,
    label = "projectId",
    showLabel = true,
    compact = false,
  } = props;

  const shellClass = compact
    ? "flex min-w-0 flex-row flex-wrap items-center gap-2"
    : "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3";

  const labelClass = compact
    ? "shrink-0 whitespace-nowrap text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
    : "shrink-0 text-sm text-zinc-700 dark:text-zinc-200";

  const inputClass = compact
    ? "min-w-[10rem] max-w-[min(20rem,45vw)] flex-1 rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
    : "min-w-0 flex-1 rounded border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

  return (
    <div className={shellClass}>
      {showLabel ? (
        <label className={labelClass} htmlFor="project-id-input">
          {label}
        </label>
      ) : null}
      <input
        id="project-id-input"
        className={`${inputClass} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        aria-readonly={readOnly}
        aria-label={showLabel ? undefined : label}
      />
      {readOnly ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">read-only (set in Phase 1)</span>
      ) : null}
    </div>
  );
}

