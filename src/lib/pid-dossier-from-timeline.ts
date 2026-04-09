import type { ParsedTimelineEvent } from "@/lib/timeline-events";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  type PidMilestoneKey,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";

function tsMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export type PidDossierChapter = {
  key: PidMilestoneKey;
  label: string;
  /** `pid_reference_milestone` rows for this key, oldest first */
  milestoneEvents: ParsedTimelineEvent[];
  /**
   * Non-PID events after the latest prior-key milestone (by canonical key order)
   * and before the first milestone of this key.
   */
  leadingIndicators: ParsedTimelineEvent[];
};

/**
 * Groups the append-only timeline into canonical PID chapters for a read-only dossier view.
 * Milestone keys outside the allowlist are ignored for structure (still appear in full timeline).
 */
export function buildPidDossierChapters(events: ParsedTimelineEvent[]): PidDossierChapter[] {
  const sorted = [...events].sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso));

  const maxPidTsByPriorKey = new Map<PidMilestoneKey, number>();
  const pidEventsByKey = new Map<PidMilestoneKey, ParsedTimelineEvent[]>();

  for (const ev of sorted) {
    if (ev.eventAction !== "pid_reference_milestone") continue;
    const k = ev.pidReferenceFields?.milestoneKey;
    if (!k || !isPidMilestoneKey(k)) continue;
    const arr = pidEventsByKey.get(k) ?? [];
    arr.push(ev);
    pidEventsByKey.set(k, arr);
    const t = tsMs(ev.timestampIso);
    const prev = maxPidTsByPriorKey.get(k) ?? -Infinity;
    if (t > prev) maxPidTsByPriorKey.set(k, t);
  }

  const chapters: PidDossierChapter[] = [];

  for (let i = 0; i < PID_MILESTONE_KEYS.length; i++) {
    const key = PID_MILESTONE_KEYS[i];
    const milestoneEvents = pidEventsByKey.get(key) ?? [];

    let tPrev = -Infinity;
    for (let j = 0; j < i; j++) {
      const pk = PID_MILESTONE_KEYS[j];
      const m = maxPidTsByPriorKey.get(pk);
      if (m !== undefined && m > tPrev) tPrev = m;
    }

    const firstSelf = milestoneEvents[0];
    const tFirst = firstSelf ? tsMs(firstSelf.timestampIso) : null;

    const leadingIndicators: ParsedTimelineEvent[] = [];
    if (tFirst !== null) {
      for (const ev of sorted) {
        if (ev.eventAction === "pid_reference_milestone") continue;
        const ts = tsMs(ev.timestampIso);
        if (ts > tPrev && ts < tFirst) leadingIndicators.push(ev);
      }
    }

    chapters.push({
      key,
      label: PID_MILESTONE_LABELS[key],
      milestoneEvents,
      leadingIndicators,
    });
  }

  return chapters;
}

/** Non-PID events that occurred after the latest PID milestone (any allowlisted key). */
export function trailingNonPidAfterLastMilestone(
  events: ParsedTimelineEvent[],
  chapters: PidDossierChapter[]
): ParsedTimelineEvent[] {
  let globalMaxPid = -Infinity;
  for (const ch of chapters) {
    for (const ev of ch.milestoneEvents) {
      const t = tsMs(ev.timestampIso);
      if (t > globalMaxPid) globalMaxPid = t;
    }
  }
  if (globalMaxPid === -Infinity) return [];

  const sorted = [...events].sort((a, b) => tsMs(a.timestampIso) - tsMs(b.timestampIso));
  return sorted.filter(
    (ev) => ev.eventAction !== "pid_reference_milestone" && tsMs(ev.timestampIso) > globalMaxPid
  );
}

export function formatDossierTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
