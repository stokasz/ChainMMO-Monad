import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  tone: "default" | "positive" | "negative" | "warning" | "accent" | "info";
  className?: string;
}

export function Badge({ children, tone, className = "" }: BadgeProps) {
  const toneClass =
    tone === "positive"
      ? "border-positive/35 text-positive bg-positive/10"
      : tone === "negative"
        ? "border-negative/35 text-negative bg-negative/10"
        : tone === "warning"
          ? "border-warning/35 text-warning bg-warning/10"
          : tone === "accent"
            ? "border-accent/35 text-accent bg-accent/10"
            : tone === "info"
              ? "border-info/35 text-info bg-info/10"
              : "border-border-subtle text-text-secondary bg-border-subtle/10";

  return <span className={`px-2 py-0.5 rounded-full border ${toneClass} text-t-xs ${className}`}>{children}</span>;
}
