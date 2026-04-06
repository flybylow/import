import Link from "next/link";
import {
  provenanceLinkIsExternal,
  timelineProvenanceForEvent,
  type TimelineProvenanceBundle,
} from "@/lib/timeline-source-provenance";

const KNOWN_BUNDLES: TimelineProvenanceBundle[] = [
  timelineProvenanceForEvent("schependomlaan-2015", "construction-schedule")!,
  timelineProvenanceForEvent("schependomlaan-2015", "ms-project-xml")!,
];

function StepRow(props: { step: TimelineProvenanceBundle["steps"][0] }) {
  const { step } = props;
  return (
    <li className="text-sm text-zinc-700 dark:text-zinc-200">
      <div className="font-medium text-zinc-900 dark:text-zinc-50">
        {step.href ? (
          <Link
            href={step.href}
            className="text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300"
            {...(provenanceLinkIsExternal(step.href)
              ? { target: "_blank", rel: "noreferrer" as const }
              : {})}
          >
            {step.label}
          </Link>
        ) : (
          step.label
        )}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{step.repoPath}</div>
    </li>
  );
}

function BundlePrimaryLinks(props: { bundle: TimelineProvenanceBundle }) {
  const { bundle } = props;
  const linkClass =
    "font-medium text-violet-700 underline underline-offset-2 hover:no-underline dark:text-violet-300";
  const items = [
    ...(bundle.primarySheet ? [bundle.primarySheet] : []),
    ...(bundle.datasetLinks ?? []),
  ];
  if (items.length === 0) return null;
  return (
    <nav
      className="mt-3 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300"
      aria-label="Original sheet and dataset"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={linkClass}
          {...(provenanceLinkIsExternal(item.href)
            ? { target: "_blank", rel: "noreferrer" as const }
            : {})}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default function TimelineProvenancePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Timeline
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Source files and data flow</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Audit events carry <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">timeline:source</code>{" "}
        (e.g. <code className="font-mono text-xs">construction-schedule</code>). That string is not a file path;
        this page and the event metadata link the <strong className="font-medium text-zinc-800 dark:text-zinc-100">actual inputs</strong>{" "}
        so you can verify materials, GUIDs, and tasks against the repo.
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Canonical write-up (same content, for git / review):{" "}
        <code className="font-mono text-xs">docs/timeline-source-provenance.md</code>
      </p>
      <p className="mt-4">
        <Link
          href="/timeline"
          className="text-sm font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
        >
          ← Back to timeline
        </Link>
      </p>

      <div className="mt-10 space-y-12">
        {KNOWN_BUNDLES.map((bundle) => (
          <section key={bundle.id} className="border-t border-zinc-200 pt-8 dark:border-zinc-700">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{bundle.title}</h2>
            <BundlePrimaryLinks bundle={bundle} />
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{bundle.intro}</p>
            <ol className="mt-4 list-decimal space-y-4 pl-5">
              {bundle.steps.map((step) => (
                <StepRow key={step.repoPath} step={step} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Materials in the CSV</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          The event log CSV has a <code className="font-mono text-xs">Material</code> column. The seeder maps
          that to <code className="font-mono text-xs">dpp:material/…</code> literals on each{" "}
          <code className="font-mono text-xs">timeline:AuditEvent</code>. Compare CSV values to{" "}
          <code className="font-mono text-xs">materialReference</code> in{" "}
          <Link
            href="/api/file?name=schependomlaan-timeline.json"
            className="text-violet-700 underline dark:text-violet-300"
            target="_blank"
            rel="noreferrer"
          >
            schependomlaan-timeline.json
          </Link>{" "}
          or the TTL from <code className="font-mono text-xs">GET /api/timeline</code>.
        </p>
      </section>
    </div>
  );
}
