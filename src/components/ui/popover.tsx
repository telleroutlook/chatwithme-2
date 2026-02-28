import { useEffect, useRef, useState } from "react";

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
}

export function Popover({ trigger, children, align = "start" }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute top-[calc(100%+8px)] z-20 min-w-64 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-primary)] p-2 shadow-[var(--app-shadow-soft)] ${align === "end" ? "right-0" : "left-0"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
