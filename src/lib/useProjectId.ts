"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "bimimport.projectId";
const FALLBACK_PROJECT_ID = "example";

function readProjectIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("projectId")?.trim();
    return fromUrl || null;
  } catch {
    return null;
  }
}

export function useProjectId() {
  const [projectId, setProjectIdState] = useState<string>(FALLBACK_PROJECT_ID);

  useEffect(() => {
    let cancelled = false;
    try {
      // Priority: explicit query param > last saved local value.
      const fromUrl = readProjectIdFromUrl();
      const saved = window.localStorage.getItem(STORAGE_KEY)?.trim();
      const initial = fromUrl || saved;
      if (initial) {
        queueMicrotask(() => {
          if (!cancelled) setProjectIdState(initial);
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
    const onPopState = () => {
      const fromUrl = readProjectIdFromUrl();
      if (fromUrl) setProjectIdState(fromUrl);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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

