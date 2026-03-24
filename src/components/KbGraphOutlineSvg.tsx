"use client";

import { useMemo } from "react";

type KBGraphOutline = {
  epds: Array<{
    epdSlug: string;
    epdName: string;
  }>;
  links: Array<{
    materialId: number;
    epdSlug: string;
  }>;
};

/** Hub → EPD “constellation”: no physics, pure SVG; good overview when the force graph is crowded. */
export default function KbGraphOutlineSvg(props: { kbGraph: KBGraphOutline }) {
  const { kbGraph } = props;

  const nodes = useMemo(() => {
    const countBySlug = new Map<string, number>();
    for (const l of kbGraph.links) {
      countBySlug.set(l.epdSlug, (countBySlug.get(l.epdSlug) ?? 0) + 1);
    }

    const n = Math.max(1, kbGraph.epds.length);
    const ring = 118;
    return kbGraph.epds.map((e, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const x = ring * Math.cos(angle);
      const y = ring * Math.sin(angle);
      const count = countBySlug.get(e.epdSlug) ?? 0;
      const short =
        e.epdSlug.length > 22 ? `${e.epdSlug.slice(0, 20)}…` : e.epdSlug;
      return {
        ...e,
        x,
        y,
        count,
        short,
        angle,
      };
    });
  }, [kbGraph.epds, kbGraph.links]);

  const vb = 150;

  return (
    <div className="w-full overflow-auto">
      <svg
        viewBox={`-${vb} -${vb} ${vb * 2} ${vb * 2}`}
        className="w-full h-auto max-h-[min(420px,55vh)] text-zinc-900 dark:text-zinc-100"
        role="img"
        aria-label="Knowledge graph outline: KB hub linked to EPD nodes with material counts"
      >
        <rect
          x={-vb}
          y={-vb}
          width={vb * 2}
          height={vb * 2}
          fill="transparent"
        />
        {nodes.map((n) => (
          <line
            key={`ln-${n.epdSlug}`}
            x1={0}
            y1={0}
            x2={n.x}
            y2={n.y}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1.5}
          />
        ))}
        <circle
          cx={0}
          cy={0}
          r={14}
          fill="currentColor"
          fillOpacity={0.9}
          className="text-zinc-900 dark:text-zinc-100"
        />
        <text
          x={0}
          y={4}
          textAnchor="middle"
          className="fill-white dark:fill-zinc-950 text-[11px] font-semibold"
        >
          KB
        </text>
        {nodes.map((n) => {
          const r = Math.min(22, 8 + Math.sqrt(Math.max(0, n.count)) * 1.8);
          return (
            <g key={n.epdSlug} transform={`translate(${n.x}, ${n.y})`}>
              <title>
                {n.epdSlug}: {n.epdName} — {n.count} linked material(s)
              </title>
              <circle
                r={r}
                fill="currentColor"
                fillOpacity={0.15}
                className="text-emerald-600 dark:text-emerald-400"
                stroke="currentColor"
                strokeOpacity={0.85}
                strokeWidth={1.5}
              />
              <text
                y={4}
                textAnchor="middle"
                className="fill-zinc-800 dark:fill-zinc-100 text-[9px] font-mono pointer-events-none"
              >
                {n.count > 0 ? n.count : "·"}
              </text>
              <text
                y={r + 12}
                textAnchor="middle"
                className="fill-zinc-600 dark:fill-zinc-400 text-[8px] font-mono pointer-events-none max-w-[80px]"
              >
                {n.short}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        Circle size ≈ linked material count. Full name in tooltip (hover). For
        per-material detail use <strong>Grouped</strong>.
      </p>
    </div>
  );
}
