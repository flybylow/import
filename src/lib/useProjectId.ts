"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "bimimport.projectId";
const FALLBACK_PROJECT_ID = "example";

export function useProjectId() {
  const [projectId, setProjectIdState] = useState<string>(FALLBACK_PROJECT_ID);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) {
        queueMicrotask(() => {
          if (!cancelled) setProjectIdState(saved.trim());
        });
      }
    } catch {
      // ignore localStorage access errors
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, projectId);
    } catch {
      // ignore localStorage access errors
    }
  }, [projectId]);

  const setProjectId = (value: string) => {
    const next = value.trim();
    setProjectIdState(next || FALLBACK_PROJECT_ID);
  };

  return { projectId, setProjectId };
}

