"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";

export default function SourcesImportToast(props: {
  imported?: boolean;
  importError?: string;
  importNote?: string;
  ttlAbsPath?: string;
}) {
  const { showToast } = useToast();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    if (props.importError) {
      firedRef.current = true;
      showToast({ type: "error", message: props.importError });
      return;
    }

    if (props.imported) {
      firedRef.current = true;
      const parts = [props.importNote, props.ttlAbsPath].filter(Boolean);
      showToast({
        type: "success",
        message: parts.length ? parts.join(" ") : "Imported successfully.",
      });
    }
  }, [props.importError, props.imported, props.importNote, props.ttlAbsPath, showToast]);

  return null;
}

