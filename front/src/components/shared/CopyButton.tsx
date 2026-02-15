import { useCallback, useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [label, setLabel] = useState("Copy");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setLabel("Copied");
    } catch {
      setLabel("Fail");
    } finally {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setLabel("Copy"), 1200);
    }
  }, [text]);

  return (
    <button
      type="button"
      className="btn-ghost rounded-sm px-2 py-1 text-t-sm"
      onClick={onCopy}
    >
      {label}
    </button>
  );
}
