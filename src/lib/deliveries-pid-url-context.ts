/**
 * Deep-link context for Deliveries → PID (`?pidMilestone=`, `?pidPhase=` / `?referencePhase=`).
 * Keeps URL → reference phase + “first milestone in same UI band” logic in one place.
 */

import {
  PID_MILESTONE_KEYS,
  type PidMilestoneKey,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";
import {
  PID_MILESTONE_REFERENCE_PHASE,
  type ReferencePhaseId,
  isReferencePhaseId,
} from "@/lib/timeline-reference-phase";

/** Horizontal dossier band ids — must match `DeliveriesPidPanel` `PID_DOSSIER_TAB_SECTIONS[].id`. */
export function pidUiBandIdForReferencePhase(phase: ReferencePhaseId): string {
  if (phase === "0" || phase === "1") return "pid-tab-design-spec";
  if (phase === "2" || phase === "3") return "pid-tab-site-completion";
  return "pid-tab-handover-after";
}

const UI_BAND_PHASE_SETS: ReadonlySet<ReferencePhaseId>[] = [
  new Set<ReferencePhaseId>(["0", "1"]),
  new Set<ReferencePhaseId>(["2", "3"]),
  new Set<ReferencePhaseId>(["4", "5", "6", "7", "8", "9"]),
];

/**
 * First allowlisted PID milestone key whose canonical phase sits in the **same horizontal band**
 * as `phase` (e.g. phase `2` → first key in phases 2–3 band, typically as-built / completion).
 */
export function firstPidMilestoneKeyInSameUiBand(phase: ReferencePhaseId): PidMilestoneKey | null {
  const band = UI_BAND_PHASE_SETS.find((s) => s.has(phase));
  if (!band) return null;
  for (const k of PID_MILESTONE_KEYS) {
    if (band.has(PID_MILESTONE_REFERENCE_PHASE[k])) return k;
  }
  return null;
}

export type PidUrlFocus = {
  milestoneKey: PidMilestoneKey | null;
  /** Explicit `pidPhase` / `referencePhase` when no valid milestone in URL */
  referencePhaseFromQuery: ReferencePhaseId | null;
  /** Milestone phase wins; else query phase */
  effectivePhase: ReferencePhaseId | null;
  invalidMilestoneToken: string | null;
  invalidPhaseToken: string | null;
};

/**
 * Read `pidMilestone` / `pidMilestoneKey` and optional `pidPhase` / `referencePhase`.
 * Invalid milestone token is reported but does not block a valid phase query.
 */
export function resolvePidUrlFocus(sp: URLSearchParams | Readonly<URLSearchParams>): PidUrlFocus {
  const mRaw =
    sp.get("pidMilestone")?.trim() || sp.get("pidMilestoneKey")?.trim() || "";
  const pRaw = sp.get("pidPhase")?.trim() || sp.get("referencePhase")?.trim() || "";

  let milestoneKey: PidMilestoneKey | null = null;
  let invalidMilestoneToken: string | null = null;
  if (mRaw) {
    if (isPidMilestoneKey(mRaw)) milestoneKey = mRaw;
    else invalidMilestoneToken = mRaw;
  }

  let referencePhaseFromQuery: ReferencePhaseId | null = null;
  let invalidPhaseToken: string | null = null;
  if (pRaw) {
    if (isReferencePhaseId(pRaw)) referencePhaseFromQuery = pRaw;
    else invalidPhaseToken = pRaw;
  }

  const effectivePhase: ReferencePhaseId | null = milestoneKey
    ? PID_MILESTONE_REFERENCE_PHASE[milestoneKey]
    : referencePhaseFromQuery;

  return {
    milestoneKey,
    referencePhaseFromQuery,
    effectivePhase,
    invalidMilestoneToken,
    invalidPhaseToken,
  };
}

/** Query value for {@link PID_TRACE_INTENT_PARAM} — “sign” = append audit / milestone so the slot is on the timeline. */
export type PidTraceIntentSign = "sign";

export const PID_TRACE_INTENT_SIGN: PidTraceIntentSign = "sign";
/** Universal reader / automation: intent of the deep link (paired with `pidExpectationId`). */
export const PID_TRACE_INTENT_PARAM = "pidTraceIntent";
/** Stable checklist slot id from `PHASE_DOCUMENT_EXPECTATIONS` (`spec_baseline`, …). */
export const PID_EXPECTATION_ID_PARAM = "pidExpectationId";

export function isPidTraceSignIntent(v: string | null | undefined): boolean {
  return v?.trim() === PID_TRACE_INTENT_SIGN;
}

export function deliveriesPidTabUrl(
  projectId: string,
  opts: {
    pidMilestone?: PidMilestoneKey;
    pidPhase?: ReferencePhaseId;
    pidExpectationId?: string;
    pidTraceIntent?: PidTraceIntentSign;
  } = {}
): string {
  const q = new URLSearchParams();
  q.set("tab", "pid");
  const p = projectId.trim();
  if (p) q.set("projectId", p);
  if (opts.pidMilestone) q.set("pidMilestone", opts.pidMilestone);
  else if (opts.pidPhase != null) q.set("pidPhase", opts.pidPhase);
  const expId = opts.pidExpectationId?.trim();
  if (expId) q.set(PID_EXPECTATION_ID_PARAM, expId);
  if (opts.pidTraceIntent === PID_TRACE_INTENT_SIGN) q.set(PID_TRACE_INTENT_PARAM, PID_TRACE_INTENT_SIGN);
  const qs = q.toString();
  return qs ? `/deliveries?${qs}` : "/deliveries";
}
