"use client";

type Props = {
  value?: string | null;
  className?: string;
  fallback?: string;
};

export default function TruncatedWithTooltip(props: Props) {
  const { value, className = "", fallback = "—" } = props;
  const text = (value ?? "").trim();
  const rendered = text || fallback;

  return (
    <span
      className={`block truncate ${className}`.trim()}
      title={rendered}
    >
      {rendered}
    </span>
  );
}
