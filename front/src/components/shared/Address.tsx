import { formatAddress } from "../../lib/format";

interface AddressProps {
  value: string | null | undefined;
  className?: string;
}

export function Address({ value, className = "" }: AddressProps) {
  const safe = typeof value === "string" ? value : "-";
  return (
    <span className={`address-link truncate ${className}`} title={safe}>
      {safe === "-" ? "-" : formatAddress(safe)}
    </span>
  );
}
