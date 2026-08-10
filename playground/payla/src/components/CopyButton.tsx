import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/cn.ts";

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore for the demo.
    }
  };

  return (
    <button
      onClick={copy}
      className={cn(
        "focusable inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-ink-2 hover:bg-surface-3",
        className,
      )}
      aria-label="Copy"
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
