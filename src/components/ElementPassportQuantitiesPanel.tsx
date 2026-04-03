"use client";

import { Fragment } from "react";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type Props = {
  passport: Phase4ElementPassport | null;
  selectedExpressId: number | null;
};

function formatQuantityValue(value: number, unit?: string) {
  const s = String(value);
  return unit ? `${s} ${unit}` : s;
}

export default function ElementPassportQuantitiesPanel(props: Props) {
  const { passport, selectedExpressId } = props;

  if (!selectedExpressId) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">IFC quantities</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Select an element to see footprint, volume, height, and other takeoff
          values from the KB.
        </p>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
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
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold">IFC quantities</h2>
      {rows.length ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          {rows.map((q, idx) => (
            <Fragment key={`${q.quantityName}-${idx}`}>
              <dt className="text-zinc-500">{q.quantityName}</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">
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
