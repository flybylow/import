"use client";

import { useEffect, useState } from "react";
import {
  loadPhase4Passports,
  Phase4PassportLoadError,
  type Phase4ElementPassport,
} from "@/lib/phase4-passports";

/** Same cap as BIM sidebar: one row per `schema:name`, diverse list. */
export const BIM_KB_ELEMENT_NAME_ROWS_LIMIT = 8_000;

type Cached = { ordered: Phase4ElementPassport[]; total: number };

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached>>();

async function loadElementNameRows(projectId: string): Promise<Cached> {
  const hit = cache.get(projectId);
  if (hit) return hit;
  let p = inflight.get(projectId);
  if (!p) {
    p = loadPhase4Passports(projectId, undefined, {
      elementPassportsLimit: BIM_KB_ELEMENT_NAME_ROWS_LIMIT,
      elementPassportsUniqueName: true,
    }).then((data) => ({ ordered: data.ordered, total: data.total }));
    inflight.set(projectId, p);
  }
  try {
    const data = await p;
    cache.set(projectId, data);
    return data;
  } finally {
    inflight.delete(projectId);
  }
}

/**
 * KB status passport slice (unique element names) for BIM sidebar + group visualizer.
 * Deduplicates in-flight and cached loads per `projectId`.
 */
export function useBimKbElementNameRows(projectId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Phase4ElementPassport[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadElementNameRows(projectId);
        if (cancelled) return;
        setRows(data.ordered);
        setTotal(data.total);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const isMissing =
          e instanceof Phase4PassportLoadError && e.code === "KB_MISSING";
        setError(isMissing ? "No KB for this project — build Phase 2 first." : msg);
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { loading, error, rows, total };
}
