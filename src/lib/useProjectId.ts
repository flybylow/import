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

  /**
   * Never read `localStorage` in the `useState` initializer: on the server `window` is
   * undefined (→ fallback), while the client reads storage immediately → different `projectId`
   * on the first paint and React hydration errors (links, counts, etc.).
   * Apply persisted id after mount in `useEffect` when the URL has no `?projectId=`.
   */
  const [internal, setInternal] = useState<string>(FALLBACK_PROJECT_ID);

  useEffect(() => {
    if (q) {
      setInternal(q);
      try {
        window.localStorage.setItem(STORAGE_KEY, q);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)?.trim();
      if (stored) setInternal(stored);
    } catch {
      // ignore
    }
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
