import Link from "next/link";
import { Fragment } from "react";

const ROW_FILES = [
  { tail: "timeline.ttl", label: "timeline" },
  { tail: "bestek-bindings.json", label: "bestek" },
  { tail: "phase0-element-groups.json", label: "phase0" },
] as const;

type ProjectDebugFileRowProps = {
  projectId: string;
  className?: string;
};

/**
 * One-line project id + `data/` file links for debugging and quick open.
 */
export default function ProjectDebugFileRow({ projectId, className = "" }: ProjectDebugFileRowProps) {
  const id = projectId.trim();
  if (!id) {
    return (
      <p className={`font-mono text-[10px] text-zinc-400 ${className}`} aria-live="polite">
        —
      </p>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] leading-none text-zinc-500 dark:text-zinc-500 ${className}`}
      aria-label="Project id and data files"
    >
      <span className="max-w-[min(100%,18rem)] truncate text-zinc-700 dark:text-zinc-300" title={id}>
        {id}
      </span>
      {ROW_FILES.map((f, i) => (
        <Fragment key={f.tail}>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <Link
            href={`/api/file?name=${encodeURIComponent(`${id}-${f.tail}`)}`}
            className="shrink-0 text-sky-700 underline decoration-zinc-300 underline-offset-2 hover:text-sky-600 dark:text-sky-400 dark:decoration-zinc-600 dark:hover:text-sky-300"
            title={`data/${id}-${f.tail}`}
          >
            {f.label}
          </Link>
        </Fragment>
      ))}
    </div>
  );
}
