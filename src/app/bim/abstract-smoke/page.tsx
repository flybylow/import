"use client";

import { useMemo } from "react";
import BimViewer3D from "@/components/BimViewer3D";

/**
 * Minimal check that WebGL + Three.js draw in this app (no KB / passports).
 * Open: /bim/abstract-smoke
 */
export default function BimAbstractThreeSmokePage() {
  const items = useMemo(
    () =>
      [1, 2, 3, 4, 5].map((i) => ({
        expressId: 1000 + i,
        label: `Smoke ${i}`,
        ifcType: "IfcWall",
        heightHint: 2,
      })),
    []
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 px-6 py-4">
      <div>
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Abstract 3D smoke test
        </h1>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Five boxes + grid. If this is empty, WebGL or canvas sizing is failing in
          the browser (see Three.js manual &quot;Responsive design&quot;).
        </p>
      </div>
      <div className="flex min-h-[min(60dvh,28rem)] flex-1 flex-col rounded border border-zinc-200 dark:border-zinc-800">
        <BimViewer3D
          items={items}
          selectedExpressId={1002}
          onSelectExpressId={() => {}}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
