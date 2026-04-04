/**
 * Shared “glass” chrome over the IFC canvas: transparent from first paint, no separate themes.
 * Slightly stronger when a panel is open so lists stay readable.
 */
export const BIM_GLASS_STRIP =
  "border-b border-white/10 bg-black/15 shadow-[0_4px_40px_rgba(0,0,0,0.25)] backdrop-blur-2xl";

/**
 * Local glass behind a toolbar or panel cluster only (not full viewport width).
 * Keeps the canvas visible and clickable in the gaps between islands.
 */
export const BIM_GLASS_ISLAND =
  "rounded-lg border border-white/10 bg-black/25 shadow-[0_2px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl";

export const BIM_GLASS_CHIP =
  "rounded-md border border-white/[0.08] bg-black/18 text-zinc-300/95 shadow-none backdrop-blur-lg";

/** Open tool panels: lighter fill than before so they read as glass, not a solid card. */
export const BIM_GLASS_OPEN =
  "rounded-md border border-white/[0.07] bg-black/30 text-zinc-300/95 shadow-[0_2px_20px_rgba(0,0,0,0.22)] backdrop-blur-xl";

/** Apply to panel scroll regions (see `.bim-panel-scroll` in globals.css). */
export const BIM_PANEL_SCROLL = "bim-panel-scroll";

/**
 * Open panel height: dynamic viewport minus fixed chrome (app header + glass strip + dock row).
 * Inner lists scroll via BIM_PANEL_SCROLL. Adjust the `calc(100dvh - …)` values if panels clip.
 */
export const BIM_PANEL_OPEN_COMPACT =
  "max-h-[calc(100dvh-10rem)] w-max min-w-0 max-w-[min(17.5rem,calc(100vw-1.25rem))]";

/** Slightly more room than compact (passport + links). */
export const BIM_PANEL_OPEN_DETAIL =
  "max-h-[calc(100dvh-9.25rem)] w-max min-w-0 max-w-[min(17.5rem,calc(100vw-1.25rem))]";

/** Tool row under the glass nav — transparent so the canvas shows through. */
export const BIM_TOOLS_DOCK =
  "border-b border-white/10 bg-transparent px-3 py-1.5 sm:px-4 lg:px-6";
