"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { BuildingIfcViewerStatusPayload } from "@/features/bim-viewer/components/BuildingIfcViewer";

const BuildingIfcViewer = dynamic(
  () => import("@/features/bim-viewer/components/BuildingIfcViewer").then((m) => m.default),
  { ssr: false, loading: () => <p className="text-xs text-zinc-500">Loading 3D viewer…</p> }
);

type Props = {
  projectId: string;
  visibleExpressIds: number[];
  /** When false, viewer loads full IFC without construction hide (saves GPU when user turns off). */
  constructionMode: boolean;
  className?: string;
};

export default function TimelineConstruction3dPanel(props: Props) {
  const { projectId, visibleExpressIds, constructionMode, className = "" } = props;
  const [ifcStatus, setIfcStatus] = useState<BuildingIfcViewerStatusPayload | null>(null);

  const constructionVisibleExpressIds = useMemo(() => {
    if (!constructionMode) return null;
    return visibleExpressIds;
  }, [constructionMode, visibleExpressIds]);

  const statusLine = ifcStatus?.message?.trim() || ifcStatus?.status || "";

  return (
    <section
      aria-label="Timeline construction 3D"
      className={`flex min-h-[min(42dvh,22rem)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-950/50 ${className}`.trim()}
    >
      <div className="relative min-h-[min(36dvh,18rem)] flex-1">
        <BuildingIfcViewer
          projectId={projectId}
          ifcSource="project"
          focusExpressId={null}
          focusExpressIds={null}
          constructionVisibleExpressIds={constructionVisibleExpressIds}
          onStatusChange={setIfcStatus}
          className="h-full min-h-[min(36dvh,18rem)] w-full rounded-none border-0 bg-transparent dark:bg-transparent"
        />
      </div>
      {statusLine ? (
        <p className="shrink-0 border-t border-zinc-200 px-3 py-1.5 font-mono text-[9px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {statusLine}
        </p>
      ) : null}
    </section>
  );
}
