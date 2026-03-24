import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useResponsive } from "../../hooks/useResponsive";
import { BottomSheet } from "./BottomSheet";

// ============ Types ============

export interface DialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Optional title */
  title?: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Optional footer */
  footer?: React.ReactNode;
  /** Mobile rendering mode */
  mobileMode?: "modal" | "sheet";
  /** Custom z-index */
  zIndex?: number;
}

// ============ Desktop Modal Component ============

const DesktopModal = memo(function DesktopModal({
  open,
  onClose,
  title,
  children,
  footer,
  zIndex = 1000
}: Omit<DialogProps, "mobileMode">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Fixed-body scroll lock
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
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
    queueMicrotask(() => panelRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
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
});

// ============ Dialog Component (Responsive) ============

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  mobileMode = "sheet",
  zIndex
}: DialogProps) {
  const { mobile } = useResponsive();

  // On mobile with sheet mode, render BottomSheet
  if (mobile && mobileMode === "sheet") {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={title}
        footer={footer}
        snap="content"
        enableSwipeToClose={true}
        zIndex={zIndex ?? 1100}
      >
        {children}
      </BottomSheet>
    );
  }

  // Desktop or modal mode
  return (
    <DesktopModal
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      zIndex={zIndex ?? 1000}
    >
      {children}
    </DesktopModal>
  );
}

// Export sub-components for direct use
export { DesktopModal };
