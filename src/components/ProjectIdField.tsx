"use client";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** Visible label text when `showLabel` is true. Default "projectId". */
  label?: string;
  /** When false, no visible label (input uses aria-label). Default true. */
  showLabel?: boolean;
};

export default function ProjectIdField(props: Props) {
  const { value, onChange, readOnly, label = "projectId", showLabel = true } = props;

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      {showLabel ? (
        <label className="text-sm text-zinc-700 dark:text-zinc-200 shrink-0" htmlFor="project-id-input">
          {label}
        </label>
      ) : null}
      <input
        id="project-id-input"
        className="min-w-0 flex-1 border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1 text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        aria-readonly={readOnly}
        aria-label={showLabel ? undefined : label}
      />
      {readOnly ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">read-only (set in Phase 1)</span>
      ) : null}
    </div>
  );
}

