/**
 * Browser-only console helpers for tracing UI actions and data loads.
 * Filter DevTools console by: bimimport
 */

function ts() {
  return new Date().toISOString();
}

export function dbg(phase: string, message: string, data?: unknown) {
  if (typeof window === "undefined") return;
  const tag = `[bimimport][${phase}] ${ts()}`;
  if (data !== undefined) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

/** User clicked a button / control (not a fetch). */
export function dbgButton(phase: string, label: string, extra?: Record<string, unknown>) {
  dbg(phase, `▶ button: ${label}`, extra);
}

/** Async fetch / load lifecycle. */
export function dbgLoad(
  phase: string,
  stage: "start" | "ok" | "error",
  label: string,
  meta?: Record<string, unknown>
) {
  dbg(phase, `● load ${stage}: ${label}`, meta);
}

