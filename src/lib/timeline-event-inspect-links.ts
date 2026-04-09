import type { ParsedTimelineEvent } from "@/lib/timeline-events";

export type TimelineInspectLink = {
  href: string;
  label: string;
  /** Open in a new tab (http(s)). */
  external?: boolean;
};

/**
 * Stable deep link: selects the row when the timeline loads (`syncEventIdQuery` on `/timeline`).
 */
export function timelineEventDeepLink(projectId: string, eventId: string): string {
  const q = new URLSearchParams();
  q.set("projectId", projectId.trim());
  q.set("eventId", eventId.trim());
  return `/timeline?${q.toString()}`;
}

/**
 * Single inspect target: open the event on the audit timeline (no TTL, documents, or other surfaces).
 */
export function collectTimelineInspectLinks(
  projectId: string,
  ev: ParsedTimelineEvent
): TimelineInspectLink[] {
  const pid = projectId.trim();
  if (!pid || !ev.eventId?.trim()) return [];
  return [{ href: timelineEventDeepLink(pid, ev.eventId), label: "Open on timeline" }];
}
