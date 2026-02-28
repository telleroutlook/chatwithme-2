import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    queueMicrotask(() => panelRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "var(--app-overlay)" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-xl rounded-2xl border bg-[var(--app-surface-primary)] text-[var(--app-text-primary)] shadow-[var(--app-shadow-medium)]",
          "border-[var(--app-border-default)]"
        )}
      >
        {title && (
          <div className="border-b border-[var(--app-border-default)] px-4 py-3 text-sm font-semibold">
            {title}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="border-t border-[var(--app-border-default)] px-4 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
