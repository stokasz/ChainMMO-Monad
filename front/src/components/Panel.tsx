import { ReactNode } from "react";

type PanelVariant = "default" | "active" | "alert" | "compact";

interface PanelProps {
  title: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  id?: string;
  variant?: PanelVariant;
  className?: string;
}

const panelVariantClass: Record<PanelVariant, string> = {
  default: "border-border-subtle/70",
  active: "panel-shell--active border-accent/45 shadow-[0_0_24px_rgba(200,170,110,0.15)]",
  alert: "panel-shell--alert border-warning/45 shadow-[0_0_24px_rgba(243,156,18,0.15)]",
  compact: "panel-shell--compact border-border-subtle/60"
};

export function Panel({
  title,
  status,
  children,
  id,
  variant = "default",
  className = ""
}: PanelProps) {
  return (
    <section
      id={id}
      className={`panel-shell rounded-[6px] border bg-bg-surface/75 backdrop-blur-[12px] ${panelVariantClass[variant]} ${className}`}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <header className="panel-header">
        <div className="panel-title">{title}</div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
