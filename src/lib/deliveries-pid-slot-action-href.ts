/**
 * Deep links from phase checklist rows → Deliveries actions, with `pidTraceIntent=sign` so clients
 * (humans, scripts, universal readers) know the URL requires an auditable timeline sign-off.
 */

import type { PhaseDocumentExpectation } from "@/lib/lifecycle-phase-document-expectations";
import { PHASE_DOCUMENT_EXPECTATIONS } from "@/lib/lifecycle-phase-document-expectations";
import {
  deliveriesPidTabUrl,
  PID_TRACE_INTENT_SIGN,
} from "@/lib/deliveries-pid-url-context";
import { REFERENCE_PHASE_IDS, type ReferencePhaseId } from "@/lib/timeline-reference-phase";

export function findPhaseDocumentExpectationById(
  expectationId: string
): { phase: ReferencePhaseId; exp: PhaseDocumentExpectation } | null {
  const id = expectationId.trim();
  if (!id) return null;
  for (const phase of REFERENCE_PHASE_IDS) {
    const exp = PHASE_DOCUMENT_EXPECTATIONS[phase].find((e) => e.id === id);
    if (exp) return { phase, exp };
  }
  return null;
}

/**
 * When a checklist slot is still missing, where to send the user (and what query flags to set for readers).
 * PID-milestone slots jump to `#deliveries-pid-register` with `pidMilestone` pre-filled; others stay on
 * `#deliveries-pid-document` (upload / reference / custom sign-off).
 */
export function missingPhaseSlotActionHref(
  projectId: string,
  phase: ReferencePhaseId,
  exp: PhaseDocumentExpectation
): string {
  const q = projectId.trim();
  if (!q) return "/deliveries";
  if (exp.id === "delivery_note") {
    return `/deliveries?tab=ingest&projectId=${encodeURIComponent(q)}`;
  }
  const signOpts = {
    pidExpectationId: exp.id,
    pidTraceIntent: PID_TRACE_INTENT_SIGN,
  } as const;
  const mk = exp.match?.pidMilestoneKeys?.[0];
  if (mk) {
    return `${deliveriesPidTabUrl(q, {
      pidMilestone: mk,
      pidPhase: phase,
      ...signOpts,
    })}#deliveries-pid-register`;
  }
  return `${deliveriesPidTabUrl(q, {
    pidPhase: phase,
    ...signOpts,
  })}#deliveries-pid-document`;
}
