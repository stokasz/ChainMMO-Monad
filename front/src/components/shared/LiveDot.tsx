interface LiveDotProps {
  status: "online" | "idle" | "error";
  label?: string;
  className?: string;
}

export function LiveDot({ status, label, className = "" }: LiveDotProps) {
  const tone =
    status === "online" ? "border-positive text-positive animate-pulse" : status === "error" ? "border-negative text-negative" : "border-muted text-muted";

  return (
    <span className={`inline-flex items-center gap-2 font-mono text-t-xs uppercase ${className}`}>
      <span
        aria-hidden="true"
        className={`inline-flex h-2 w-2 rounded-full border ${tone} ${status === "online" ? "bg-positive/20" : "bg-white/10"}`}
      />
      {label ? <span className="tracking-[0.08em]">{label}</span> : null}
    </span>
  );
}
