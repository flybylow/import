"use client";

import styles from "./BimIfcHousePreloader.module.css";

type Props = {
  /** Shown under the house (e.g. viewer status message). */
  message?: string;
  className?: string;
  /**
   * `overlay` — absolute fill + dim (IFC canvas area).
   * `inline` — centered block (e.g. Suspense / route fallback).
   */
  variant?: "overlay" | "inline";
};

/**
 * Minimal “house under construction” mark: scaffolding pulse, walls rising, roof lowered into place.
 */
export default function BimIfcHousePreloader({
  message,
  className = "",
  variant = "overlay",
}: Props) {
  const root =
    variant === "inline"
      ? `pointer-events-none flex min-h-[min(50vh,26rem)] w-full flex-col items-center justify-center px-4 ${className}`
      : `pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] dark:bg-black/45 ${className}`;

  return (
    <div className={root} role="status" aria-live="polite" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <svg
          className={`${styles.houseSvg} h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]`}
          viewBox="0 0 80 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <line
            x1="8"
            y1="62"
            x2="72"
            y2="62"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity={0.35}
          />
          <g className={styles.scaffold}>
            <line x1="14" y1="62" x2="14" y2="20" stroke="currentColor" strokeWidth="1.2" />
            <line x1="66" y1="62" x2="66" y2="20" stroke="currentColor" strokeWidth="1.2" />
            <line x1="11" y1="40" x2="69" y2="40" stroke="currentColor" strokeWidth="1" opacity={0.65} />
            <line x1="11" y1="28" x2="69" y2="28" stroke="currentColor" strokeWidth="0.9" opacity={0.45} />
          </g>
          <g className={styles.walls}>
            <rect
              x="28"
              y="34"
              width="24"
              height="28"
              stroke="currentColor"
              strokeWidth="1.5"
              rx="0.5"
            />
          </g>
          <g className={styles.window}>
            <rect x="33" y="42" width="6" height="6" stroke="currentColor" strokeWidth="1" rx="0.5" />
            <rect x="45" y="42" width="6" height="6" stroke="currentColor" strokeWidth="1" rx="0.5" />
          </g>
          <g className={styles.roof}>
            <path
              d="M 22 36 L 40 14 L 58 36 Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        </svg>
        {message ? (
          <p className="max-w-[16rem] text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {message}
          </p>
        ) : (
          <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}
      </div>
    </div>
  );
}
