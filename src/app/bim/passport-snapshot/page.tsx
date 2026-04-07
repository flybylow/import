"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PassportFireSnapshot } from "@/components/PassportFireSnapshot";
import { loadPhase4Passports, type Phase4ElementPassport } from "@/lib/phase4-passports";
import {
  bimBuildingElementHref,
  bimPassportsElementHref,
  kbGraphElementHref,
} from "@/lib/passport-navigation-links";
import { appContentWidthClass } from "@/lib/app-page-layout";

function PassportSnapshotPageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId")?.trim() ?? "";
  const expressIdRaw = searchParams.get("expressId")?.trim() ?? "";
  const expressId = Number.parseInt(expressIdRaw, 10);

  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [passport, setPassport] = useState<Phase4ElementPassport | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setPassport(null);
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadPhase4Passports(projectId);
        if (cancelled) return;
        if (Number.isFinite(expressId)) {
          setPassport(data.byExpressId[expressId] ?? null);
        } else {
          setPassport(null);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPassport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, expressId]);

  const backHref =
    projectId && Number.isFinite(expressId)
      ? `/bim?projectId=${encodeURIComponent(projectId)}&view=passports&expressId=${encodeURIComponent(String(expressId))}`
      : projectId
        ? `/bim?projectId=${encodeURIComponent(projectId)}&view=passports`
        : "/bim";

  const selectedMissingFromPassportBatch =
    Boolean(projectId) &&
    Number.isFinite(expressId) &&
    !loading &&
    !error &&
    passport == null;

  const kbMissing = error != null && error.includes("No linked KB");

  return (
    <div className={`${appContentWidthClass} min-h-0 flex-1 overflow-y-auto py-6`}>
      <p className="text-sm">
        <Link
          href={backHref}
          className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
        >
          ← Passports
        </Link>
      </p>

      <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Passport fire snapshot
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        IFC property-set fire rating as stored in the KB (<code className="font-mono text-xs">ont:fireRating</code>
        ). Not shown in the Passports viewer — open from the finder preview when you need provenance.
      </p>

      {projectId && Number.isFinite(expressId) ? (
        <nav
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-b border-zinc-200 pb-3 text-sm dark:border-zinc-800"
          aria-label="Open this element elsewhere"
        >
          <Link
            href={bimPassportsElementHref(projectId, expressId)}
            className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
          >
            Passports
          </Link>
          <Link
            href={bimBuildingElementHref(projectId, expressId)}
            className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
          >
            3D (Building)
          </Link>
          <Link
            href={kbGraphElementHref(projectId, expressId)}
            className="font-medium text-violet-700 underline hover:no-underline dark:text-violet-300"
          >
            KB graph
          </Link>
        </nav>
      ) : null}

      {!projectId ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Add <code className="font-mono text-xs">projectId</code> and optionally{" "}
          <code className="font-mono text-xs">expressId</code> to the query string, or use{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">View fire snapshot</strong> from
          Passports.
        </p>
      ) : loading ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Loading passport slice…</p>
      ) : error ? (
        <div
          className={
            kbMissing
              ? "mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              : "mt-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          }
        >
          {error}
        </div>
      ) : null}

      {error && kbMissing ? (
        <p className="mt-4 text-sm">
          <Link href="/kb" className="text-violet-700 underline dark:text-violet-300">
            Phase 2 — Link materials
          </Link>
        </p>
      ) : null}

      {!loading && !error && projectId ? (
        <div className="mt-6 rounded-lg border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
          {Number.isFinite(expressId) && passport ? (
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-zinc-800 dark:text-zinc-200">{expressId}</span>
              {passport.elementName ? (
                <>
                  {" "}
                  · <span className="text-zinc-700 dark:text-zinc-300">{passport.elementName}</span>
                </>
              ) : null}
              {passport.ifcType ? (
                <>
                  {" "}
                  · <span className="font-mono">{passport.ifcType}</span>
                </>
              ) : null}
            </p>
          ) : Number.isFinite(expressId) ? (
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono">{expressId}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              No <code className="font-mono">expressId</code> in the URL — pick an element in Passports and
              open this page from the preview.
            </p>
          )}
          {Number.isFinite(expressId) ? (
            <PassportFireSnapshot
              projectId={projectId}
              passport={passport}
              selectedExpressId={expressId}
              selectedMissingFromPassportBatch={selectedMissingFromPassportBatch}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Standalone fire-rating / KB provenance page (linked from Passports finder preview). */
export default function PassportSnapshotPage() {
  return (
    <Suspense
      fallback={
        <div className={`${appContentWidthClass} py-6 text-sm text-zinc-500`}>Loading…</div>
      }
    >
      <PassportSnapshotPageContent />
    </Suspense>
  );
}
