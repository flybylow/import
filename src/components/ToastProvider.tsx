"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  showToast: (args: { type?: ToastType; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export default function ToastProvider(props: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((args: { type?: ToastType; message: string }) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const type = args.type ?? "info";
    const next: ToastItem = {
      id,
      type,
      message: args.message,
    };
    setToasts((prev) => [...prev, next]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <div className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 w-[320px] max-w-[90vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded border px-3 py-2 text-sm shadow ${
              t.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : t.type === "error"
                  ? "bg-red-50 border-red-300 text-red-900"
                  : "bg-zinc-50 border-zinc-300 text-zinc-900"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

