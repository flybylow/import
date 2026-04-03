"use client";

import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
  onClearSelection: () => void;
};

export default function ElementPassportPanel(props: Props) {
  if (!props.selectedExpressId) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Element passport</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Select an element to inspect identity and materials. IFC quantities appear in the right column.
        </p>
      </div>
    );
  }

  if (!props.passport) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Element passport</h2>
          <button type="button" className="text-xs underline" onClick={props.onClearSelection}>
            Clear
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          No passport row found for expressId <code>{props.selectedExpressId}</code>.
        </p>
      </div>
    );
  }

  const p = props.passport;
  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Element passport</h2>
        <button type="button" className="text-xs underline" onClick={props.onClearSelection}>
          Clear
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-zinc-500">expressId</dt>
        <dd className="font-mono">{p.expressId ?? p.elementId}</dd>
        <dt className="text-zinc-500">name</dt>
        <dd>{p.elementName ?? "—"}</dd>
        <dt className="text-zinc-500">ifcType</dt>
        <dd className="font-mono">{p.ifcType ?? "—"}</dd>
        <dt className="text-zinc-500">globalId</dt>
        <dd className="font-mono break-all">{p.globalId ?? "—"}</dd>
        <dt className="text-zinc-500">IFC fire (Pset)</dt>
        <dd>{p.ifcFireRating ?? "—"}</dd>
      </dl>

      <div className="mt-4">
        <p className="text-xs font-medium">Materials</p>
        {p.materials.length ? (
          <ul className="mt-1 space-y-1 text-xs">
            {p.materials.map((m) => (
              <li
                key={`${p.elementId}-${m.materialId}`}
                className="rounded border border-zinc-200 dark:border-zinc-800 p-2"
              >
                <div className="font-mono">{m.materialId}</div>
                <div>{m.materialName}</div>
                {m.hasEPD ? (
                  <div className="text-zinc-600 dark:text-zinc-300">
                    {m.epdSlug ?? "—"} {m.epdName ? `- ${m.epdName}` : ""}
                  </div>
                ) : (
                  <div className="text-amber-700 dark:text-amber-300">No EPD linked</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">No material links on this element.</p>
        )}
      </div>
    </div>
  );
}
