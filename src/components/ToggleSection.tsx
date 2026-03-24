"use client";

import { type ReactNode } from "react";

type Props = {
  title: ReactNode;
  defaultOpen?: boolean;
  summaryClassName?: string;
  className?: string;
  children: ReactNode;
};

export default function ToggleSection({
  title,
  defaultOpen = false,
  summaryClassName = "cursor-pointer text-sm text-zinc-700 dark:text-zinc-200",
  className = "",
  children,
}: Props) {
  return (
    <details open={defaultOpen} className={className}>
      <summary className={summaryClassName}>{title}</summary>
      {children}
    </details>
  );
}
