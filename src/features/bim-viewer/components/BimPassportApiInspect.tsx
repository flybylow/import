"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ElementPassportView, { type ElementPassport } from "@/components/ElementPassportView";
import PassportElementFinder, {
  type FinderListItem,
} from "@/components/PassportElementFinder";
import {
  kbStatusPassportsUrl,
  passportTypeGroupKeyFromRow,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";
import { useToast } from "@/components/ToastProvider";

type Props = {
  projectId: string;
  className?: string;
};

const PREVIEW_CHARS = 14_000;

type InspectDisplay = "code" | "ui";

function inspectDisplayFromParam(v: string | null): InspectDisplay {
  return v === "ui" ? "ui" : "code";
}

function coercePassports(rows: unknown): ElementPassport[] {
  if (!Array.isArray(rows)) return [];
  const out: ElementPassport[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const elementId = typeof o.elementId === "number" ? o.elementId : Number(o.elementId);
    if (!Number.isFinite(elementId)) continue;
    out.push({
      elementId,
      elementName: typeof o.elementName === "string" ? o.elementName : undefined,
      ifcType: typeof o.ifcType === "string" ? o.ifcType : undefined,
      ifcPredefinedType:
        typeof o.ifcPredefinedType === "string" ? o.ifcPredefinedType : undefined,
      globalId: typeof o.globalId === "string" ? o.globalId : undefined,
      expressId: typeof o.expressId === "number" ? o.expressId : Number.isFinite(Number(o.expressId)) ? Number(o.expressId) : undefined,
      ifcFireRating: typeof o.ifcFireRating === "string" ? o.ifcFireRating : undefined,
      sameNameElementCount:
        typeof o.sameNameElementCount === "number" ? o.sameNameElementCount : undefined,
      materials: Array.isArray(o.materials) ? (o.materials as ElementPassport["materials"]) : [],
      ifcQuantities: Array.isArray(o.ifcQuantities)
        ? (o.ifcQuantities as ElementPassport["ifcQuantities"])
        : [],
    });
  }
  return out;
}

function finderItemsFromPassports(passports: ElementPassport[]): FinderListItem[] {
  const out: FinderListItem[] = [];
  for (const p of passports) {
    const expressId = p.expressId ?? p.elementId;
    if (!Number.isFinite(expressId)) continue;
    const label = p.elementName?.trim() || `element-${p.elementId}`;
    out.push({
      expressId,
      label,
      ifcType: p.ifcType,
      typeGroupKey: passportTypeGroupKeyFromRow({
        elementId: p.elementId,
        elementName: p.elementName,
        ifcType: p.ifcType,
        ifcPredefinedType: p.ifcPredefinedType,
        expressId: p.expressId,
        materials: p.materials,
        ifcQuantities: p.ifcQuantities,
      }),
      globalId: p.globalId,
    });
  }
  out.sort((a, b) => a.expressId - b.expressId);
  return out;
}

function passportMapFromElementPassports(
  passports: ElementPassport[]
): Record<number, Phase4ElementPassport> {
  const out: Record<number, Phase4ElementPassport> = {};
  for (const p of passports) {
    const id = p.expressId ?? p.elementId;
    if (!Number.isFinite(id)) continue;
    out[id] = { ...p } as Phase4ElementPassport;
  }
  return out;
}

/**
 * Third BIM mode: call the same KB status URL as Passports, show status + JSON preview.
 * For frequent API checks without loading the full passport UI.
 */
export default function BimPassportApiInspect(props: Props) {
  const { projectId, className = "" } = props;
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const inspectDisplay = inspectDisplayFromParam(searchParams.get("inspectDisplay"));

  const setInspectDisplay = useCallback(
    (mode: InspectDisplay) => {
      const p = new URLSearchParams(searchParams.toString());
      if (mode === "code") p.delete("inspectDisplay");
      else p.set("inspectDisplay", "ui");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const apiPath = useMemo(() => kbStatusPassportsUrl(projectId), [projectId]);
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return apiPath;
    return `${window.location.origin}${apiPath}`;
  }, [apiPath]);

  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const [selectedExpressId, setSelectedExpressId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setSummary("");
      setPreview("");
      setParsed(null);
      setHttpStatus(null);
      try {
        const res = await fetch(apiPath);
        if (cancelled) return;
        setHttpStatus(res.status);
        const text = await res.text();
        let pretty = text;
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          setParsed(j);
          pretty = JSON.stringify(j, null, 2);
          const rows = Array.isArray(j.elementPassports)
            ? j.elementPassports.length
            : 0;
          const total = j.elementPassportTotal;
          setSummary(
            `elementPassports: ${rows} row(s) in payload` +
              (typeof total === "number"
                ? ` · elementPassportTotal: ${total}`
                : "")
          );
        } catch {
          setParsed(null);
          setSummary("Response is not JSON.");
        }
        setPreview(
          pretty.length > PREVIEW_CHARS
            ? `${pretty.slice(0, PREVIEW_CHARS)}\n\n… (${pretty.length} chars total)`
            : pretty
        );
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSummary(`Fetch error: ${msg}`);
        setPreview("");
        setParsed(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [apiPath, fetchKey]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      showToast({ type: "success", message: "API URL copied." });
    } catch {
      showToast({ type: "error", message: "Could not copy URL." });
    }
  }, [absoluteUrl, showToast]);

  const uiPassports = useMemo(
    () => (parsed ? coercePassports(parsed.elementPassports) : []),
    [parsed]
  );

  const finderItems = useMemo(() => finderItemsFromPassports(uiPassports), [uiPassports]);
  const passportByExpressId = useMemo(
    () => passportMapFromElementPassports(uiPassports),
    [uiPassports]
  );

  /** Keep URL `expressId` in sync when opening inspect / sharing links. */
  useEffect(() => {
    const raw = searchParams.get("expressId")?.trim();
    if (!raw) {
      setSelectedExpressId(null);
      return;
    }
    const n = Number(raw);
    setSelectedExpressId(Number.isFinite(n) ? n : null);
  }, [searchParams]);

  const patchInspectQuery = useCallback(
    (patch: { expressId?: number | null; group?: string | null }) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("projectId", projectId);
      p.set("view", "inspect");
      if (inspectDisplay === "ui") p.set("inspectDisplay", "ui");
      if (patch.expressId !== undefined) {
        if (patch.expressId == null) p.delete("expressId");
        else p.set("expressId", String(patch.expressId));
      }
      if (patch.group !== undefined) {
        if (patch.group == null || patch.group === "") p.delete("group");
        else p.set("group", patch.group);
      }
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [inspectDisplay, pathname, projectId, router, searchParams]
  );

  const uiTotal =
    parsed && typeof parsed.elementPassportTotal === "number"
      ? parsed.elementPassportTotal
      : uiPassports.length;
  const uiLimit =
    parsed && typeof parsed.elementPassportsLimit === "number"
      ? parsed.elementPassportsLimit
      : uiPassports.length;
  const uiUniqueByName =
    parsed == null
      ? true
      : parsed.elementPassportsUniqueName !== false;
  const uiElementsInModel =
    parsed && typeof parsed.elementPassportElementsTotal === "number"
      ? parsed.elementPassportElementsTotal
      : undefined;

  const epdCov = parsed?.epdCoverage as Record<string, unknown> | undefined;
  const epdMaterialsTotal =
    epdCov && typeof epdCov.materialsTotal === "number" ? epdCov.materialsTotal : null;
  const epdWith =
    epdCov && typeof epdCov.materialsWithEPD === "number" ? epdCov.materialsWithEPD : null;

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${className}`.trim()}>
      <div className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Inspect — KB status (passport slice)
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          Same endpoint as Passports. Use this when you need to verify the API
          quickly or compare with curl.
        </p>
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Inspect display"
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            View
          </span>
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-600 overflow-hidden">
            <button
              type="button"
              role="tab"
              aria-selected={inspectDisplay === "code"}
              onClick={() => setInspectDisplay("code")}
              className={`px-2.5 py-1 text-[11px] font-medium ${
                inspectDisplay === "code"
                  ? "bg-violet-600 text-white"
                  : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectDisplay === "ui"}
              onClick={() => setInspectDisplay("ui")}
              className={`border-l border-zinc-300 px-2.5 py-1 text-[11px] font-medium dark:border-zinc-600 ${
                inspectDisplay === "ui"
                  ? "bg-violet-600 text-white"
                  : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              Parsed UI
            </button>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-500">
            URL: <code className="font-mono">inspectDisplay=ui</code>
            {" · "}
            <code className="font-mono">group=</code> / <code className="font-mono">expressId=</code> drill-down
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full break-all rounded bg-white px-1.5 py-1 font-mono text-[10px] dark:bg-zinc-900">
            {absoluteUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-zinc-600 dark:bg-zinc-900"
          >
            Copy URL
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setFetchKey((k) => k + 1)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Refetch
          </button>
          <a
            href={apiPath}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-violet-700 underline dark:text-violet-300"
          >
            Open in new tab
          </a>
        </div>
        {httpStatus != null ? (
          <p className="mt-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
            HTTP {httpStatus}
            {summary ? ` · ${summary}` : ""}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
            Loading…
          </p>
        ) : null}
      </div>

      {inspectDisplay === "code" ? (
        <pre className="min-h-0 flex-1 overflow-auto rounded border border-zinc-200 bg-white p-3 text-[11px] leading-snug text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          {preview || (loading ? "…" : "—")}
        </pre>
      ) : parsed ? (
        <div className="flex min-h-0 min-h-[min(52dvh,28rem)] flex-1 flex-col gap-3 overflow-hidden rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid shrink-0 gap-2 text-[11px] text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
            {typeof parsed.projectId === "string" ? (
              <div>
                <span className="font-medium text-zinc-500 dark:text-zinc-400">projectId</span>{" "}
                <code className="font-mono">{parsed.projectId}</code>
              </div>
            ) : null}
            {typeof parsed.kbPath === "string" ? (
              <div>
                <span className="font-medium text-zinc-500 dark:text-zinc-400">kbPath</span>{" "}
                <code className="break-all font-mono">{parsed.kbPath}</code>
              </div>
            ) : null}
            {typeof parsed.elementCount === "number" ? (
              <div>
                <span className="font-medium text-zinc-500 dark:text-zinc-400">elementCount</span>{" "}
                <span className="font-mono">{parsed.elementCount.toLocaleString()}</span>
              </div>
            ) : null}
            {epdMaterialsTotal != null && epdWith != null ? (
              <div>
                <span className="font-medium text-zinc-500 dark:text-zinc-400">EPD materials</span>{" "}
                <span className="font-mono">
                  {epdWith.toLocaleString()} / {epdMaterialsTotal.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
          {finderItems.length === 0 ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              No <span className="font-mono">elementPassports</span> rows in this response.
            </p>
          ) : (
            <>
              <p className="shrink-0 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                Same Miller columns as Passports: IFC type → instance → detail (quantities, materials, links).
                No 3D canvas here — use Building or Passports for the model.
              </p>
              <div className="min-h-0 flex-1 overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
                <PassportElementFinder
                  projectId={projectId}
                  items={finderItems}
                  selectedExpressId={selectedExpressId}
                  onSelectExpressId={(id) => {
                    setSelectedExpressId(id);
                    patchInspectQuery({ expressId: id });
                  }}
                  onCommitGroupToUrl={(groupKey) => {
                    setSelectedExpressId(null);
                    patchInspectQuery({ expressId: null, group: groupKey });
                  }}
                  urlGroupKey={searchParams.get("group")?.trim() ?? ""}
                  passportByExpressId={passportByExpressId}
                  disabled={loading}
                  typeGroupColumnCaption="IFC type · click = choose group (next column)"
                  instancesColumnCaption="Instances in the selected group"
                  className="flex h-full min-h-[min(44dvh,24rem)] max-h-full flex-1 rounded-none border-0 bg-transparent dark:bg-transparent"
                />
              </div>
              <details className="shrink-0 rounded border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                  Flat list (all rows in this batch)
                </summary>
                <div className="max-h-[min(40dvh,20rem)] overflow-auto border-t border-zinc-200 p-2 dark:border-zinc-800">
                  <ElementPassportView
                    passports={uiPassports}
                    total={uiTotal}
                    limit={uiLimit}
                    totalElementsInModel={uiElementsInModel}
                    uniqueByName={uiUniqueByName}
                  />
                </div>
              </details>
            </>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-amber-200 bg-amber-50/80 p-3 text-[11px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {loading
            ? "…"
            : "Parsed UI needs valid JSON. Switch to JSON to inspect the raw response."}
        </div>
      )}
    </div>
  );
}
