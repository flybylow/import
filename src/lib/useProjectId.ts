"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "bimimport.projectId";
const FALLBACK_PROJECT_ID = "example";

/**
 * Project id for API calls and UI.
 *
 * - **`?projectId=` in the URL** (e.g. `/kb?projectId=example`) is applied on every navigation
 *   so deep links and Phase 3/4 handoffs stay in sync (fixes client-side transitions that only
 *   read the query on first mount).
 * - If the URL has no `projectId`, we fall back to **localStorage** and **`setProjectId`**.
 */
export function useProjectId() {
  const searchParams = useSearchParams();
  const q = searchParams.get("projectId")?.trim() ?? "";

  const [internal, setInternal] = useState<string>(() => {
    if (typeof window === "undefined") return FALLBACK_PROJECT_ID;
    try {
      return window.localStorage.getItem(STORAGE_KEY)?.trim() || FALLBACK_PROJECT_ID;
    } catch {
      return FALLBACK_PROJECT_ID;
    }
  });

  useEffect(() => {
    if (q) setInternal(q);
  }, [q]);

  const projectId = q || internal;

  const setProjectId = useCallback((value: string) => {
    const next = value.trim() || FALLBACK_PROJECT_ID;
    setInternal(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return { projectId, setProjectId };
}
