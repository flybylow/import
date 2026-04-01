"use client";

import {
  type ButtonHTMLAttributes,
  forwardRef,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "muted";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  outline:
    "border border-zinc-300 bg-transparent text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800",
  muted:
    "border border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 shadow-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-500",
};

/**
 * Phase flow actions: primary = main CTA, secondary/outline = alternatives,
 * muted = placeholder / coming soon (visually grayed; usually disabled).
 */
const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className = "", disabled, type = "button", ...rest },
  ref
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors";
  const v = variantClass[variant];
  const disabledClass =
    variant === "muted"
      ? "cursor-not-allowed"
      : "disabled:opacity-60 disabled:pointer-events-none";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`${base} ${v} ${disabledClass} ${className}`.trim()}
      {...rest}
    />
  );
});

Button.displayName = "Button";

export default Button;
