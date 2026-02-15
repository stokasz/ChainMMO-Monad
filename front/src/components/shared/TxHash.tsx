import { formatHash } from "../../lib/format";

interface TxHashProps {
  value: string;
  className?: string;
}

export function TxHash({ value, className = "" }: TxHashProps) {
  return (
    <span className={`hash-link truncate ${className}`} title={value}>
      {formatHash(value)}
    </span>
  );
}
