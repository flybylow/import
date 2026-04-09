import { isReferencePhaseId, type ReferencePhaseId } from "@/lib/timeline-reference-phase";

export const DELIVERIES_PID_CUSTOM_SLOT_MARKER = "bimimport:deliveriesPidCustomSlot";

export function buildDeliveriesPidCustomSlotTimelineMessage(opts: {
  label: string;
  phaseDigit: string;
  notes: string;
  /** When set (e.g. from checklist deep link), satisfies that slot via {@link matchExpectationEvents}. */
  expectationId?: string;
}): string {
  const phaseLine =
    opts.phaseDigit.trim() && /^[0-9]$/.test(opts.phaseDigit.trim())
      ? `phase: ${opts.phaseDigit.trim()}`
      : "phase: —";
  const lines = [
    DELIVERIES_PID_CUSTOM_SLOT_MARKER,
    phaseLine,
    `label: ${opts.label.trim()}`,
  ];
  if (opts.expectationId?.trim()) {
    lines.push(`expectationId: ${opts.expectationId.trim()}`);
  }
  if (opts.notes.trim()) lines.push("", opts.notes.trim());
  return lines.join("\n");
}

/** Parses `expectationId:` from a structured custom-slot `manual_note` body. */
export function parseCustomSlotExpectationIdFromMessage(message: string): string | null {
  const msg = message.trim();
  if (!msg.includes(DELIVERIES_PID_CUSTOM_SLOT_MARKER)) return null;
  const m = msg.match(/^\s*expectationId:\s*(\S+)/m);
  return m?.[1]?.trim() ?? null;
}

/** Parses `label:` from a structured custom-slot body (human title for UI matrices). */
export function parseCustomSlotLabelFromMessage(message: string): string | null {
  const msg = message.trim();
  if (!msg.includes(DELIVERIES_PID_CUSTOM_SLOT_MARKER)) return null;
  const m = msg.match(/^\s*label:\s*(.+)$/m);
  const raw = m?.[1]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Free-text notes after the structured block (blank line separator in {@link buildDeliveriesPidCustomSlotTimelineMessage}). */
export function parseCustomSlotUserNotesFromMessage(message: string): string {
  const msg = message.trim();
  if (!msg.includes(DELIVERIES_PID_CUSTOM_SLOT_MARKER)) return "";
  const idx = msg.indexOf("\n\n");
  if (idx < 0) return "";
  return msg.slice(idx + 2).trim();
}

/** Parses `phase:` from a structured custom-slot body for lifecycle bucketing. */
export function parseCustomSlotReferencePhaseFromMessage(message: string): ReferencePhaseId | null {
  const msg = message.trim();
  if (!msg.includes(DELIVERIES_PID_CUSTOM_SLOT_MARKER)) return null;
  const m = msg.match(/^\s*phase:\s*(\S+)\s*$/m);
  if (!m) return null;
  const raw = m[1]!.trim();
  if (raw === "—" || raw === "-" || raw === "--") return null;
  if (isReferencePhaseId(raw)) return raw;
  return null;
}
