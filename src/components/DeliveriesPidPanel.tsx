"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import { CollapseSection, InfoDetails } from "@/components/InfoDetails";
import { useToast } from "@/components/ToastProvider";
import {
  PID_MILESTONE_KEYS,
  PID_MILESTONE_LABELS,
  type PidMilestoneKey,
  isPidMilestoneKey,
} from "@/lib/timeline-pid-milestones";

type DeliveriesPidPanelProps = {
  projectId: string;
};

export default function DeliveriesPidPanel({ projectId }: DeliveriesPidPanelProps) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const prefillKey = searchParams.get("pidMilestone")?.trim() ?? "";

  const initialKey = useMemo((): PidMilestoneKey | "" => {
    if (prefillKey && isPidMilestoneKey(prefillKey)) return prefillKey;
    return "";
  }, [prefillKey]);

  const [milestoneKey, setMilestoneKey] = useState<PidMilestoneKey | "">(initialKey);

  useEffect(() => {
    if (initialKey) setMilestoneKey(initialKey);
  }, [initialKey]);
  const [lifecyclePhase, setLifecyclePhase] = useState("");
  const [stateHint, setStateHint] = useState("");
  const [dateLocal, setDateLocal] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [message, setMessage] = useState("");
  const [actorLabel, setActorLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seedBaseDate, setSeedBaseDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [seedSpacingDays, setSeedSpacingDays] = useState(30);
  const [seedForce, setSeedForce] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const seedTemplate = useCallback(async () => {
    setSeedError(null);
    const baseIso = seedBaseDate.trim()
      ? `${seedBaseDate.trim()}T12:00:00.000Z`
      : new Date().toISOString();
    setSeeding(true);
    try {
      const res = await fetch("/api/timeline/seed-pid-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          baseDateIso: baseIso,
          spacingDays: seedSpacingDays,
          force: seedForce,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        appended?: number;
      };
      if (!res.ok) {
        setSeedError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({
        type: "success",
        message: `Appended ${j.appended ?? PID_MILESTONE_KEYS.length} PID template milestones — open Timeline and use “PID milestones” filter`,
      });
    } catch {
      setSeedError("Network error");
    } finally {
      setSeeding(false);
    }
  }, [projectId, seedBaseDate, seedForce, seedSpacingDays, showToast]);

  const submit = useCallback(async () => {
    setError(null);
    if (!milestoneKey) {
      setError("Choose a milestone key.");
      return;
    }
    const ts = dateLocal.trim()
      ? new Date(`${dateLocal.trim()}T12:00:00.000Z`).toISOString()
      : new Date().toISOString();
    setSubmitting(true);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          eventAction: "pid_reference_milestone",
          pidMilestoneKey: milestoneKey,
          ...(lifecyclePhase.trim() && /^[0-9]$/.test(lifecyclePhase.trim())
            ? { pidLifecyclePhase: lifecyclePhase.trim() }
            : {}),
          ...(stateHint.trim() ? { pidStateHint: stateHint.trim() } : {}),
          timestampIso: ts,
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(actorLabel.trim() ? { actorLabel: actorLabel.trim() } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        setError([j.error, j.details].filter(Boolean).join(": ") || res.statusText);
        return;
      }
      showToast({ type: "success", message: "PID milestone recorded on timeline" });
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [
    actorLabel,
    dateLocal,
    lifecyclePhase,
    message,
    milestoneKey,
    projectId,
    showToast,
    stateHint,
  ]);

  return (
    <section className="space-y-4 pt-2" aria-label="PID lifecycle">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
        PID / process lifecycle
      </h2>

      <CollapseSection title="Template PID timeline (fill empty project)" defaultOpen={false}>
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            Appends <strong className="text-zinc-800 dark:text-zinc-200">one row per PID milestone</strong>{" "}
            (<span className="font-mono text-[12px]">{PID_MILESTONE_KEYS.length}</span> events) with{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
              pid_reference_milestone
            </code>
            , synthetic spacing, and{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
              source=pid-template-seed
            </code>
            . Use real dates later by adding manual milestones or editing the TTL if needed.
          </p>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">First milestone date</span>
            <input
              type="date"
              className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={seedBaseDate}
              onChange={(e) => setSeedBaseDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Days between milestones</span>
            <input
              type="number"
              min={1}
              max={3650}
              className="w-32 rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={seedSpacingDays}
              onChange={(e) => setSeedSpacingDays(Number(e.target.value) || 30)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-zinc-300 dark:border-zinc-600"
              checked={seedForce}
              onChange={(e) => setSeedForce(e.target.checked)}
            />
            <span>Force append even if PID milestones already exist</span>
          </label>
          {seedError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {seedError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={seeding || !projectId.trim()}
              onClick={() => void seedTemplate()}
            >
              {seeding ? "Appending…" : "Append full PID template"}
            </Button>
            <InfoDetails label="When to use">
              <p className="text-[13px]">
                Empty <code className="font-mono">*-timeline.ttl</code> and you want the PID strip to show
                something immediately. On <strong>/timeline</strong>, switch the log to{" "}
                <strong>PID milestones</strong> to see only these rows.
              </p>
            </InfoDetails>
          </div>
        </div>
      </CollapseSection>

      <CollapseSection title="Register PID milestone" defaultOpen>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Milestone</span>
            <select
              className="w-full max-w-lg rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={milestoneKey}
              onChange={(e) =>
                setMilestoneKey(
                  e.target.value && isPidMilestoneKey(e.target.value)
                    ? e.target.value
                    : ""
                )
              }
            >
              <option value="">Select…</option>
              {PID_MILESTONE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PID_MILESTONE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Event date (UTC noon if date-only)</span>
            <input
              type="date"
              className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Process phase (optional, 0–9)</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={1}
              placeholder="e.g. 2"
              className="w-24 rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={lifecyclePhase}
              onChange={(e) => setLifecyclePhase(e.target.value.replace(/\D/g, "").slice(0, 1))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">State hint (optional, UI only)</span>
            <input
              type="text"
              className="w-full max-w-lg rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="e.g. ACCUMULATING"
              value={stateHint}
              onChange={(e) => setStateHint(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Message (optional)</span>
            <textarea
              className="min-h-[72px] w-full rounded border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-600 dark:text-zinc-400">Actor label (optional)</span>
            <input
              type="text"
              className="w-full max-w-lg rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={actorLabel}
              onChange={(e) => setActorLabel(e.target.value)}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "Saving…" : "Append to timeline"}
            </Button>
            <InfoDetails label="Deep link prefill">
              <p className="text-[13px]">
                Add <code className="font-mono">?pidMilestone=pv_provisional_signed</code> (any allowlisted
                key) to this page URL to pre-select the milestone.
              </p>
            </InfoDetails>
          </div>
        </div>
      </CollapseSection>
    </section>
  );
}
