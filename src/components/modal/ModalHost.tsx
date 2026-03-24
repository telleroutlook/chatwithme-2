import { useEffect, useCallback, memo, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalStack } from "./useModalStack";
import { XIcon } from "@phosphor-icons/react";
import { useResponsive } from "../../hooks/useResponsive";
import { useSheetSwipeClose } from "../../hooks/useSheetSwipeClose";

// ============ Dev Singleton Guard ============

const singletons = new Set<string>();
const isDev = import.meta.env.DEV;

function registerDevSingleton(name: string, scope: string = "default"): void {
  if (isDev) {
    const key = `${name}:${scope}`;
    if (singletons.has(key)) {
      throw new Error(
        `[chatwithme] ${name} must be rendered only once in a single React tree. ` +
          `Please check your component tree.`
      );
    }
    singletons.add(key);
  }
}

function unregisterDevSingleton(name: string, scope: string = "default"): void {
  if (isDev) {
    const key = `${name}:${scope}`;
    singletons.delete(key);
  }
}

function resolveZIndex(id: string | number, zIndex?: number): number {
  if (typeof zIndex === "number" && Number.isFinite(zIndex)) {
    return zIndex;
  }

  const numericId = typeof id === "number" ? id : Number.parseInt(id.replace(/\D/g, ""), 10);

  const safeOffset = Number.isFinite(numericId) ? numericId : 0;
  return 4000 + safeOffset;
}

// ============ Fixed-Body Scroll Lock ============

/**
 * Global scroll lock manager using fixed-body technique
 * Prevents iOS viewport jump when opening/closing modals
 */
class ScrollLockManager {
  private scrollY = 0;
  private lockCount = 0;

  lock(): void {
    if (this.lockCount === 0) {
      this.scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${this.scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }
    this.lockCount++;
  }

  unlock(): void {
    this.lockCount--;
    if (this.lockCount <= 0) {
      this.lockCount = 0;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, this.scrollY);
    }
  }
}

const scrollLockManager = new ScrollLockManager();

// ============ Desktop Modal Component ============

interface ModalProps {
  id: string | number;
  title?: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode | null;
  visible: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  mask?: boolean;
  width?: number | string;
  maxWidth?: number | string;
  className?: string;
  zIndex?: number;
  centered?: boolean;
  onClose: () => void;
  animationDuration?: number;
}

const DesktopModal = memo(function Modal({
  id,
  title,
  content,
  footer,
  visible,
  closable = true,
  maskClosable = true,
  mask = true,
  width = 520,
  maxWidth = "90vw",
  className = "",
  zIndex,
  centered: _centered = true,
  onClose,
  animationDuration = 200
}: ModalProps) {
  const titleId = `modal-title-${String(id)}`;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle mask click
  const handleMaskClick = useCallback(() => {
    if (maskClosable) {
      onClose();
    }
  }, [maskClosable, onClose]);

  // Handle keyboard and scroll lock
  useEffect(() => {
    if (!visible) return;

    // Store previous focus
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable) {
        onClose();
      }

      if (e.key !== "Tab") {
        return;
      }

      const dialog = document.querySelector<HTMLElement>(`[data-modal-id=\"${String(id)}\"]`);
      if (!dialog) {
        return;
      }
      const focusables = dialog.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Use fixed-body scroll lock
    scrollLockManager.lock();

    queueMicrotask(() => {
      const dialog = document.querySelector<HTMLElement>(`[data-modal-id=\"${String(id)}\"]`);
      dialog?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      scrollLockManager.unlock();
      previousFocusRef.current?.focus();
    };
  }, [visible, closable, onClose, id]);

  if (!visible && !content) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: resolveZIndex(id, zIndex)
      }}
    >
      {/* Mask */}
      {mask && (
        <div
          className={`
            absolute inset-0 bg-[var(--app-overlay)] transition-opacity
            ${visible ? "opacity-100" : "opacity-0"}
          `}
          style={{
            transitionDuration: `${animationDuration}ms`
          }}
          onClick={handleMaskClick}
        />
      )}

      {/* Modal Content */}
      <div
        className={`
          relative rounded-xl shadow-2xl
          bg-[var(--app-surface-primary)] ring ring-[var(--app-border-default)]
          transition-all transform
          ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}
          ${className}
        `}
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
          transitionDuration: `${animationDuration}ms`
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-modal-id={String(id)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || closable) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            {title && (
              <p className="text-lg font-bold text-foreground" id={titleId}>
                {title}
              </p>
            )}
            {closable && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close modal"
              >
                <XIcon size={20} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{content}</div>

        {/* Footer */}
        {footer !== null && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            {footer || (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3 disabled:pointer-events-none disabled:opacity-50"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ============ Mobile Bottom Sheet Component ============

interface MobileSheetProps extends ModalProps {
  snap?: "content" | "half" | "full";
  enableSwipeToClose?: boolean;
}

const MobileSheet = memo(function MobileSheet({
  id,
  title,
  content,
  footer,
  visible,
  closable = true,
  maskClosable = true,
  mask = true,
  snap = "content",
  enableSwipeToClose = true,
  animationDuration = 200,
  onClose
}: MobileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Use shared swipe-to-close hook
  const { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel } =
    useSheetSwipeClose({
      enabled: enableSwipeToClose,
      onClose,
      sheetRef
    });

  // Handle keyboard and scroll lock
  useEffect(() => {
    if (!visible) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable) {
        onClose();
      }

      if (e.key !== "Tab") return;

      const sheet = sheetRef.current;
      if (!sheet) return;

      const focusables = sheet.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    scrollLockManager.lock();

    queueMicrotask(() => sheetRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      scrollLockManager.unlock();
      previousFocusRef.current?.focus();
    };
  }, [visible, closable, onClose]);

  // Calculate snap height
  const getSnapHeight = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const safeAreaBottom = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom") || "0",
      10
    );

    switch (snap) {
      case "full":
        return viewportHeight - safeAreaBottom - 48;
      case "half":
        return viewportHeight * 0.5;
      default:
        return undefined;
    }
  }, [snap]);

  if (!visible && !content) return null;

  return (
    <div
      className={`fixed inset-0 ${visible ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ zIndex: resolveZIndex(id) }}
    >
      {/* Backdrop */}
      {mask && (
        <div
          className={`
            absolute inset-0 bg-[var(--app-overlay)] transition-opacity
            ${visible ? "opacity-100" : "opacity-0"}
          `}
          style={{ transitionDuration: `${animationDuration}ms` }}
          onClick={maskClosable ? onClose : undefined}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? String(title) : "Bottom sheet"}
        aria-labelledby={title ? `sheet-title-${String(id)}` : undefined}
        tabIndex={-1}
        data-modal-id={String(id)}
        data-drag-handle
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className={`
          fixed bottom-0 left-0 right-0 flex flex-col
          bg-[var(--app-surface-primary)] rounded-t-2xl
          shadow-[var(--app-shadow-medium)]
          transition-transform ease-out
          ${visible ? "translate-y-0" : "translate-y-full"}
        `}
        style={{
          height: getSnapHeight(),
          maxHeight: snap === "full" ? undefined : "90vh",
          paddingBottom: "var(--safe-area-inset-bottom, 0px)",
          transitionDuration: `${animationDuration}ms`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div
          data-drag-handle
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
        >
          <div className="w-10 h-1 rounded-full bg-[var(--app-border-strong)]" />
        </div>

        {/* Header */}
        {(title || closable) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            {title && (
              <p className="text-lg font-bold text-foreground" id={`sheet-title-${String(id)}`}>
                {title}
              </p>
            )}
            {closable && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <XIcon size={20} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div data-sheet-scrollable className="flex-1 overflow-y-auto px-5 py-4">
          {content}
        </div>

        {/* Footer */}
        {footer !== null && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            {footer || (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3 disabled:pointer-events-none disabled:opacity-50"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ============ Modal Host ============

/**
 * Modal Host Component
 *
 * Renders all modals in the stack via React Portal.
 * On mobile, renders as bottom sheet; on desktop, renders as centered modal.
 * Must be rendered only once in the app.
 */
export function ModalHost() {
  const { modals } = useModalStack();
  const { mobile } = useResponsive();

  // Dev singleton guard
  useEffect(() => {
    registerDevSingleton("ModalHost");
    return () => unregisterDevSingleton("ModalHost");
  }, []);

  // Portal target
  const target = typeof document !== "undefined" ? document.body : null;

  if (!target || modals.length === 0) {
    return null;
  }

  return createPortal(
    <>
      {modals.map((modal) => {
        const ModalComponent = mobile ? MobileSheet : DesktopModal;

        return (
          <ModalComponent
            key={modal.id}
            id={modal.id}
            title={modal.title}
            content={modal.content}
            footer={modal.footer}
            visible={modal.visible}
            closable={modal.closable}
            maskClosable={modal.maskClosable}
            mask={modal.mask}
            width={modal.width}
            maxWidth={modal.maxWidth}
            className={modal.className}
            zIndex={modal.zIndex}
            centered={modal.centered}
            onClose={modal.close}
            animationDuration={modal.animationDuration}
          />
        );
      })}
    </>,
    target
  );
}

export { DesktopModal, MobileSheet };
