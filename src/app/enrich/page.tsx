"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EnrichResponse = {
  projectId: string;
  ttlPath: string;
  ttl: string;
  diff?: {
    addedCount: number;
    removedCount: number;
    addedPreview: string[];
    removedPreview: string[];
  };
  materialMatch?: {
    inBoth: number[];
    onlyInOld: number[];
    onlyInNew: number[];
  };
};

export default function EnrichMvpPage() {
  const [projectId, setProjectId] = useState<string>("example");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showFullEnrichedTtl, setShowFullEnrichedTtl] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "diff" | "materialMatch" | "quantities"
  >("diff");
  const [materialOverrides, setMaterialOverrides] = useState<
    Record<number, "matched" | "unmatched">
  >({});
  const [savedEnriched, setSavedEnriched] = useState(false);

  const preview = useMemo(() => {
    if (!result?.ttl) return [];
    // Small preview: first ~80 lines to confirm it looks like Turtle.
    return result.ttl.split(/\r?\n/).slice(0, 80);
  }, [result?.ttl]);

  const quantitiesPreview = useMemo(() => {
    const ttl = result?.ttl;
    if (!ttl) return [];

    // Phase 2 Step 1 now stores *all* BaseQuantities as quantity nodes:
    //   bim:qty-<elementId>-<i>
    //     ont:ifcQuantityName "..."
    //     ont:ifcQuantityValue 0.123^^xsd:decimal;
    const qtyHeaderRe = /^bim:qty-(\d+)-(\d+)\s*$/;
    const nameRe = /ont:ifcQuantityName\s+"([^"]+)"/;
    const valueRe = /ont:ifcQuantityValue\s+([0-9eE+\\.-]+)/;

    const lines = ttl.split(/\r?\n/);

    const byElement = new Map<
      number,
      Array<{ name?: string; value?: string; unit?: string }>
    >();

    let currentElementId: number | null = null;
    let currentQty: { name?: string; value?: string; unit?: string } | null =
      null;

    const flush = () => {
      if (currentElementId == null || !currentQty) return;
      const arr = byElement.get(currentElementId) ?? [];
      arr.push(currentQty);
      byElement.set(currentElementId, arr);
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const qh = qtyHeaderRe.exec(trimmed);
      if (qh) {
        flush();
        currentElementId = Number(qh[1]);
        currentQty = {};
        continue;
      }

      if (currentElementId == null || !currentQty) continue;

      const n = nameRe.exec(trimmed);
      if (n) currentQty.name = n[1];

      const v = valueRe.exec(trimmed);
      if (v) currentQty.value = v[1];
    }

    flush();

    const LIMIT_ELEMENTS = 10;
    const elementIds = Array.from(byElement.keys()).slice(0, LIMIT_ELEMENTS);

    const blocks: string[] = [];
    for (const eid of elementIds) {
      const arr = byElement.get(eid) ?? [];
      const linesOut = arr
        .slice(0, 8)
        .map((q) => `${q.name ?? "(unknown)"} = ${q.value ?? "(unknown)"}`);
      blocks.push([`bim:element-${eid}`, ...linesOut].join("\n"));
    }

    return blocks;
  }, [result?.ttl]);

  const quickMetrics = useMemo(() => {
    const ttl = result?.ttl;
    if (!ttl) return null;

    const elementHeaderRe = /^bim:element-(\d+)\s*$/;
    const materialHeaderRe = /^bim:material-(\d+)\s*$/;

    const elementsTotal = new Set<number>();
    const materialsTotal = new Set<number>();
    const elementsWithAnyQuantity = new Set<number>();

    const materialsWithSchemaName = new Set<number>();
    const materialsWithLayerSetName = new Set<number>();
    const materialsWithLayerThickness = new Set<number>();

    let currentElementId: number | null = null;
    let currentMaterialId: number | null = null;

    const qtyHeaderRe = /^bim:qty-(\d+)-(\d+)\s*$/;

    for (const rawLine of ttl.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const eh = elementHeaderRe.exec(trimmed);
      if (eh) {
        currentElementId = Number(eh[1]);
        elementsTotal.add(currentElementId);
        continue;
      }

      const mh = materialHeaderRe.exec(trimmed);
      if (mh) {
        currentMaterialId = Number(mh[1]);
        materialsTotal.add(currentMaterialId);
        continue;
      }

      const qh = qtyHeaderRe.exec(trimmed);
      if (qh) {
        elementsWithAnyQuantity.add(Number(qh[1]));
        continue;
      }

      if (currentMaterialId != null) {
        if (trimmed.includes("schema:name")) materialsWithSchemaName.add(currentMaterialId);
        if (trimmed.includes("ont:layerSetName")) materialsWithLayerSetName.add(currentMaterialId);
        if (trimmed.includes("ont:layerThickness")) materialsWithLayerThickness.add(currentMaterialId);
      }
    }

    return {
      elementsTotal: elementsTotal.size,
      elementsWithAnyQuantity: elementsWithAnyQuantity.size,
      materialsTotal: materialsTotal.size,
      materialsWithSchemaName: materialsWithSchemaName.size,
      materialsWithLayerSetName: materialsWithLayerSetName.size,
      materialsWithLayerThickness: materialsWithLayerThickness.size,
    };
  }, [result?.ttl]);

  const runEnrich = async () => {
    setError(null);
    setResult(null);
    setDownloadUrl(null);
    setSavedEnriched(false);
    setShowFullEnrichedTtl(false);
    setLoading(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `POST /api/enrich failed`);
      }

      const json: EnrichResponse = await res.json();
      setResult(json);
      setMaterialOverrides(() => {
        const m = json.materialMatch;
        const next: Record<number, "matched" | "unmatched"> = {};
        const inBoth = m?.inBoth ?? [];
        const onlyInOld = m?.onlyInOld ?? [];
        const onlyInNew = m?.onlyInNew ?? [];
        // Default mapping:
        // - inBoth: matched
        // - onlyInOld: unmatched
        // - onlyInNew: unmatched (no corresponding old material)
        for (const id of inBoth) next[id] = "matched";
        for (const id of onlyInOld) next[id] = "unmatched";
        for (const id of onlyInNew) next[id] = "unmatched";
        return next;
      });

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const runTranslate = async () => {
    setError(null);
    setResult(null);
    setDownloadUrl(null);
    setShowFullEnrichedTtl(false);
    setLoading(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "POST /api/translate failed");
      }

      const json: EnrichResponse = await res.json();
      setResult(json);

      const blob = new Blob([json.ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setActiveTab("diff");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  // Phase 2 MVP pipeline: Enrich -> Translate -> Build KB
  // After that we land on `/kb` where the KB visualization + manual matching UI lives.
  const runPipelineToKb = async () => {
    setError(null);
    setResult(null);
    setDownloadUrl(null);
    setSaving(false);
    setShowFullEnrichedTtl(false);
    setLoading(true);
    try {
      const enrichRes = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!enrichRes.ok) {
        const msg = await enrichRes.text();
        throw new Error(msg || "POST /api/enrich failed");
      }

      const translateRes = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!translateRes.ok) {
        const msg = await translateRes.text();
        throw new Error(msg || "POST /api/translate failed");
      }

      router.push(
        `/kb?projectId=${encodeURIComponent(projectId)}&autoBuild=1`
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const resultLabel = useMemo(() => {
    const p = result?.ttlPath ?? "";
    if (p.includes("-translated.ttl")) return "Translated TTL written to";
    if (p.includes("-enriched.ttl")) return "Enriched TTL written to";
    return "TTL written to";
  }, [result?.ttlPath]);

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Phase 2 - Link</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        MVP for Phase 2: run enrich/translate and prepare link results. Graph and
        manual link overrides are handled on the linking page.
      </p>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">Step 1: Enrich (MVP)</h2>
        <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
          For now, this step writes a new output file for inspection:
          <div className="mt-1">
            <code className="font-mono">data/&lt;projectId&gt;-enriched.ttl</code>
          </div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
            Phase 1 source (example IFC)
          </summary>
          <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200">
            Example source: <code className="font-mono">data/IFC Schependomlaan.ifc</code>
            <div className="mt-1">
              <a
                className="underline"
                href={`/api/file?name=${encodeURIComponent("IFC Schependomlaan.ifc")}`}
              >
                Open / download
              </a>
            </div>
          </div>
        </details>

        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm text-zinc-700 dark:text-zinc-200">
            projectId
          </label>
          <input
            className="border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1 text-sm bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </div>

        <button
          className="mt-4 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
          disabled={loading}
          onClick={runPipelineToKb}
        >
          {loading ? "Running Phase 2..." : "Run Phase 2: Enrich -> Translate -> Build Link Graph"}
        </button>

        <button
          className="mt-4 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
          disabled={loading}
          onClick={runEnrich}
        >
          {loading ? "Enriching..." : "Run Step 1 Enrich"}
        </button>

        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>

      <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-base font-medium">Step 2 Translate (MVP)</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-200">
          <li>Match materials to available EPD data (dictionary MVP for now) and attach EPD nodes.</li>
        </ul>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            disabled={!savedEnriched || loading}
            className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            onClick={runTranslate}
          >
            Run Step 2 Translate
          </button>
        </div>
      </div>

      {result ? (
        <div className="p-4 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            {resultLabel}:{" "}
            <code className="font-mono">{result.ttlPath}</code>
          </p>
          {downloadUrl ? (
            <a
              className="mt-2 inline-block text-sm font-medium underline"
              href={downloadUrl}
              download={result.ttlPath.split("/").pop() ?? `${result.projectId}.ttl`}
            >
              Download enriched TTL
            </a>
          ) : null}

          <details className="mt-4" open>
            <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-200">
              {result?.ttlPath?.includes("-translated.ttl")
                ? "Translated TTL preview (first lines)"
                : "Enriched TTL preview (first lines)"}
            </summary>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={showFullEnrichedTtl}
                  onChange={(e) => setShowFullEnrichedTtl(e.target.checked)}
                />
                <span>Show more (render-limited)</span>
              </label>
            </div>

            <pre className="mt-3 p-3 text-xs leading-5 font-mono max-h-[35vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
              {(() => {
                if (!result?.ttl) return "—";
                // We already render a preview elsewhere; this toggle exists for quick inspection.
                // For very large models, rendering the whole TTL string can get slow, so we cap it.
                const fullLimitLines = 2000;
                if (!showFullEnrichedTtl) return preview.join("\n");
                const lines = result.ttl.split(/\r?\n/);
                if (lines.length <= fullLimitLines) return lines.join("\n");
                return lines.slice(0, fullLimitLines).join("\n");
              })()}
            </pre>

            {showFullEnrichedTtl && result?.ttl ? (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                If the TTL is larger than the render limit, download the file to view it all.
              </p>
            ) : null}
          </details>

          <div className="mt-4 flex items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              onClick={() => {
                (async () => {
                  setError(null);
                  setSaving(true);
                  try {
                    const res = await fetch(
                      `/api/enriched?projectId=${encodeURIComponent(projectId)}`
                    );
                    if (!res.ok) {
                      const msg = await res.text();
                      throw new Error(msg || `GET /api/enriched failed`);
                    }
                    const json: { ttl: string } = await res.json();
                    // Reload from disk so the UI metrics/preview match the saved file.
                    setResult((prev) =>
                      prev ? { ...prev, ttl: json.ttl } : prev
                    );
                    setDownloadUrl(() => {
                      const blob = new Blob([json.ttl], {
                        type: "text/turtle",
                      });
                      return URL.createObjectURL(blob);
                    });
                    setSavedEnriched(true);
                    setActiveTab("quantities");
                  } catch (e: any) {
                    setError(e?.message ?? String(e));
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
              disabled={loading || saving}
              className="inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
            >
              {saving
                ? "Loading saved TTL..."
                : savedEnriched
                  ? "Reload enriched"
                  : "Save enriched"}
            </button>
            {savedEnriched ? (
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Using: <code className="font-mono">data/{projectId}-enriched.ttl</code>
              </span>
            ) : (
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                Step 2/3 will unlock once saved.
              </span>
            )}
          </div>

          {quickMetrics ? (
            <div className="mt-4 p-3 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Quick metrics (from enriched TTL)
              </p>
              <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-200 space-y-1">
                <div>
                  Elements with quantities:{" "}
                  <code className="font-mono">
                    {quickMetrics.elementsWithAnyQuantity}/{quickMetrics.elementsTotal}
                  </code>
                </div>
                <div>
                  Materials with layer info (layerSetName):{" "}
                  <code className="font-mono">
                    {quickMetrics.materialsWithLayerSetName}/{quickMetrics.materialsTotal}
                  </code>
                </div>
                <div>
                  Materials with layer thickness:{" "}
                  <code className="font-mono">
                    {quickMetrics.materialsWithLayerThickness}/{quickMetrics.materialsTotal}
                  </code>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              className="text-sm font-medium underline"
              onClick={() => setActiveTab("diff")}
              disabled={loading}
            >
              Diff
            </button>
            <button
              className="text-sm font-medium underline"
              onClick={() => setActiveTab("materialMatch")}
              disabled={loading}
            >
              Material match/unmatch
            </button>
            <button
              className="text-sm font-medium underline"
              onClick={() => setActiveTab("quantities")}
              disabled={loading}
            >
              Quantities preview
            </button>
          </div>

          {activeTab === "diff" ? (
            <div className="mt-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Added lines:{" "}
                <code className="font-mono">{result.diff?.addedCount ?? 0}</code> · Removed lines:{" "}
                <code className="font-mono">{result.diff?.removedCount ?? 0}</code>
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Added (preview)</p>
                  <pre className="mt-2 p-3 text-xs leading-5 font-mono max-h-[20vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
                    {(result.diff?.addedPreview ?? []).join("\n") || "—"}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium">Removed (preview)</p>
                  <pre className="mt-2 p-3 text-xs leading-5 font-mono max-h-[20vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded">
                    {(result.diff?.removedPreview ?? []).join("\n") || "—"}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "materialMatch" ? (
            <div className="mt-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Materials in both graphs:{" "}
                <code className="font-mono">{result.materialMatch?.inBoth.length ?? 0}</code>
                {" · "}Only in old:{" "}
                <code className="font-mono">{result.materialMatch?.onlyInOld.length ?? 0}</code>
                {" · "}Only in new:{" "}
                <code className="font-mono">{result.materialMatch?.onlyInNew.length ?? 0}</code>
              </p>

              <p className="mt-3 text-sm font-medium">Override match status (local-only)</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                This is a Phase 2 UI MVP. It does not affect backend enrichment yet.
              </p>

              <div className="mt-3 space-y-3">
                {(() => {
                  const inBoth = result.materialMatch?.inBoth ?? [];
                  const onlyInOld = result.materialMatch?.onlyInOld ?? [];
                  const onlyInNew = result.materialMatch?.onlyInNew ?? [];
                  const all = Array.from(new Set([...inBoth, ...onlyInOld, ...onlyInNew])).sort((a, b) => a - b);
                  const LIMIT = 60;
                  const sliced = all.slice(0, LIMIT);
                  if (!sliced.length) return <p className="text-sm">No material IDs found.</p>;

                  return sliced.map((id) => {
                    const current = materialOverrides[id] ?? "unmatched";
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-3 text-sm border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={current === "matched"}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMaterialOverrides((prev) => ({
                              ...prev,
                              [id]: checked ? "matched" : "unmatched",
                            }));
                          }}
                        />
                        <span className="font-mono">{id}</span>
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {inBoth.includes(id)
                            ? "(in both)"
                            : onlyInOld.includes(id)
                              ? "(only old)"
                              : "(only new)"}
                        </span>
                      </label>
                    );
                  });
                })()}
              </div>

              <button
                disabled
                className="mt-4 inline-flex items-center justify-center rounded px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black disabled:opacity-60"
              >
                Apply overrides (coming soon)
              </button>
            </div>
          ) : null}

          {activeTab === "quantities" ? (
            <div className="mt-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-200">
                Quantities preview grouped by element (limited):
              </p>
              <div className="mt-2 space-y-3">
                {quantitiesPreview.length ? (
                  quantitiesPreview.map((b, idx) => (
                    <pre
                      key={`${idx}-${b.slice(0, 24)}`}
                      className="p-3 text-xs leading-5 font-mono max-h-[18vh] overflow-auto border border-zinc-200 dark:border-zinc-800 rounded"
                    >
                      {b}
                    </pre>
                  ))
                ) : (
                  <p>—</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

