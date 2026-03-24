"use client";

import { useMemo, useState } from "react";

export type KBGraphGrouped = {
  materials: Array<{
    materialId: number;
    materialName: string;
    hasEPD: boolean;
    epdSlug?: string;
    matchType?: string;
    matchConfidence?: number;
  }>;
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

export default function KbGraphGroupedByEpd(props: { kbGraph: KBGraphGrouped }) {
  const { kbGraph } = props;
  const [q, setQ] = useState("");

  const { groups, unmatched, totalMatched, totalUnmatched } = useMemo(() => {
    const epdMeta = new Map(
      kbGraph.epds.map((e) => [e.epdSlug, e.epdName])
    );
    const bySlug = new Map<
      string,
      { epdSlug: string; epdName: string; materials: typeof kbGraph.materials }
    >();

    for (const e of kbGraph.epds) {
      bySlug.set(e.epdSlug, {
        epdSlug: e.epdSlug,
        epdName: e.epdName,
        materials: [],
      });
    }

    for (const m of kbGraph.materials) {
      if (m.hasEPD && m.epdSlug) {
        let g = bySlug.get(m.epdSlug);
        if (!g) {
          g = {
            epdSlug: m.epdSlug,
            epdName: epdMeta.get(m.epdSlug) ?? m.epdSlug,
            materials: [],
          };
          bySlug.set(m.epdSlug, g);
        }
        g.materials.push(m);
      }
    }

    const groups = Array.from(bySlug.values()).sort(
      (a, b) => b.materials.length - a.materials.length
    );

    const unmatched = kbGraph.materials.filter((m) => !m.hasEPD);
    const totalMatched = kbGraph.materials.filter((m) => m.hasEPD).length;
    const totalUnmatched = unmatched.length;

    return { groups, unmatched, totalMatched, totalUnmatched };
  }, [kbGraph]);

  const qLower = q.trim().toLowerCase();
  const filterMat = (name: string, id: number) => {
    if (!qLower) return true;
    return (
      name.toLowerCase().includes(qLower) || String(id).includes(qLower)
    );
  };

  const filterEpd = (slug: string, name: string) => {
    if (!qLower) return true;
    return (
      slug.toLowerCase().includes(qLower) || name.toLowerCase().includes(qLower)
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          Filter
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Material id, name, or EPD slug…"
          className="flex-1 min-w-[12rem] max-w-md rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {totalMatched} matched · {totalUnmatched} without EPD
        </span>
      </div>

      <div className="max-h-[min(52vh,560px)] overflow-auto rounded border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
        {groups.map((g) => {
          const mats = g.materials.filter((m) =>
            filterMat(m.materialName, m.materialId)
          );
          const showGroup =
            mats.length > 0 ||
            (qLower === "" ? true : filterEpd(g.epdSlug, g.epdName));
          if (!showGroup) return null;

          return (
            <details
              key={g.epdSlug}
              className="group open:bg-zinc-50/80 dark:open:bg-zinc-900/40"
              open={mats.length <= 8}
            >
              <summary className="cursor-pointer list-none px-3 py-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
                  {g.epdSlug}
                </span>
                <span className="text-zinc-800 dark:text-zinc-100 flex-1 min-w-0">
                  {g.epdName}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">
                  {g.materials.length} material
                  {g.materials.length === 1 ? "" : "s"}
                </span>
              </summary>
              <ul className="px-3 pb-3 pt-0 space-y-1.5">
                {(qLower ? mats : g.materials).length ? (
                  (qLower ? mats : g.materials).map((m) => (
                    <li
                      key={m.materialId}
                      className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 pl-2 border-l-2 border-zinc-200 dark:border-zinc-700"
                    >
                      <span className="text-zinc-500 dark:text-zinc-500 shrink-0">
                        {m.materialId}
                      </span>
                      <span className="break-words flex-1">{m.materialName}</span>
                      {typeof m.matchConfidence === "number" ? (
                        <span className="text-zinc-500 dark:text-zinc-500">
                          conf {m.matchConfidence.toFixed(2)}
                        </span>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-zinc-500 dark:text-zinc-500 pl-2 italic">
                    No materials match this filter.
                  </li>
                )}
              </ul>
            </details>
          );
        })}

        {unmatched.length ? (
          <details className="open:bg-red-50/40 dark:open:bg-red-950/20">
            <summary className="cursor-pointer list-none px-3 py-2.5 flex flex-wrap items-baseline gap-2 hover:bg-red-50/60 dark:hover:bg-red-950/30">
              <span className="font-medium text-red-800 dark:text-red-300">
                Without EPD
              </span>
              <span className="text-xs text-zinc-500">
                {unmatched.length} material
                {unmatched.length === 1 ? "" : "s"}
              </span>
            </summary>
            <ul className="px-3 pb-3 space-y-1.5">
              {unmatched
                .filter((m) => filterMat(m.materialName, m.materialId))
                .map((m) => (
                  <li
                    key={m.materialId}
                    className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 pl-2 border-l-2 border-red-200 dark:border-red-900"
                  >
                    <span className="text-zinc-500 dark:text-zinc-500">
                      {m.materialId}
                    </span>
                    <span className="break-words">{m.materialName}</span>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
