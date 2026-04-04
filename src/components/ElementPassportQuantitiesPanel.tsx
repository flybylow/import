"use client";

import { Fragment } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
  className?: string;
};

function panelClass(extra?: string) {
  const base =
    "min-w-0 rounded-lg border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80";
  const x = extra?.trim();
  return x ? `${base} ${x}` : base;
}

function formatQuantityValue(value: number, unit?: string) {
  const s = String(value);
  return unit ? `${s} ${unit}` : s;
}

export default function ElementPassportQuantitiesPanel(props: Props) {
  const { passport, selectedExpressId, className } = props;

  if (!selectedExpressId) {
    return (
      <div className={panelClass(className)}>
        <h2 className="text-sm font-semibold">IFC quantities</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Pick an element in the finder for footprint, volume, height, and other takeoff values from the
          KB.
        </p>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className={panelClass(className)}>
        <h2 className="text-sm font-semibold">IFC quantities</h2>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          No passport row found for expressId{" "}
          <code className="font-mono">{selectedExpressId}</code>.
        </p>
      </div>
    );
  }

  const rows = passport.ifcQuantities;

  return (
    <div className={panelClass(className)}>
      <h2 className="text-sm font-semibold">IFC quantities</h2>
      {rows.length ? (
        <dl className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
          {rows.map((q, idx) => (
            <Fragment key={`${q.quantityName}-${idx}`}>
              <dt className="min-w-0 break-words text-zinc-500">{q.quantityName}</dt>
              <dd className="min-w-0 break-all font-mono text-zinc-900 dark:text-zinc-100">
                {formatQuantityValue(q.value, q.unit)}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          No IFC quantities on this element.
        </p>
      )}
    </div>
  );
}
