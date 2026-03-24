"use client";

import { useMemo } from "react";
import BimViewer3D from "@/components/BimViewer3D";
import ElementPassportPanel from "@/components/ElementPassportPanel";
import type { Phase4ElementPassport } from "@/lib/phase4-passports";

type ViewerItem = {
  expressId: number;
  label: string;
  ifcType?: string;
  heightHint?: number;
};

type Props = {
  loading: boolean;
  kbMissing: boolean;
  selectedExpressId: number | null;
  onSelectExpressId: (id: number | null) => void;
  passportByExpressId: Record<number, Phase4ElementPassport>;
  passportsOrdered: Phase4ElementPassport[];
};

export default function PassportModelView(props: Props) {
  const {
    loading,
    kbMissing,
    selectedExpressId,
    onSelectExpressId,
    passportByExpressId,
    passportsOrdered,
  } = props;

  const viewerItems = useMemo<ViewerItem[]>(
    () =>
      passportsOrdered.map((p) => ({
        expressId: p.expressId ?? p.elementId,
        label: p.elementName ?? `element-${p.elementId}`,
        ifcType: p.ifcType,
        heightHint: p.ifcQuantities.find((q) => q.quantityName === "Height")?.value,
      })),
    [passportsOrdered]
  );

  const selectedPassport = useMemo(
    () =>
      selectedExpressId != null
        ? (passportByExpressId[selectedExpressId] ?? null)
        : null,
    [passportByExpressId, selectedExpressId]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <section className="space-y-2">
        {viewerItems.length ? (
          <BimViewer3D
            items={viewerItems}
            selectedExpressId={selectedExpressId}
            onSelectExpressId={(id) => onSelectExpressId(id)}
          />
        ) : (
          <div className="h-[60vh] min-h-[24rem] rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center text-sm text-zinc-600 dark:text-zinc-300">
            {loading
              ? "Loading viewer data..."
              : kbMissing
                ? "No linked KB yet. Build Phase 2 first."
                : "No element passports available for this project."}
          </div>
        )}
      </section>

      <aside className="space-y-3">
        <ElementPassportPanel
          passport={selectedPassport}
          selectedExpressId={selectedExpressId}
          onClearSelection={() => onSelectExpressId(null)}
        />
      </aside>
    </div>
  );
}
