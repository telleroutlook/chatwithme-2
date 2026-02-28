import { useState } from "react";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-8 left-1/2 z-30 -translate-x-1/2 rounded-md border border-[var(--app-border-default)] bg-[var(--surface-elevated)] px-2 py-1 text-[11px] text-[var(--app-text-primary)] shadow-[var(--app-shadow-soft)]"
        >
          {label}
        </span>
      )}
    </span>
  );
}
