import { useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useModalStack } from "./useModalStack";
import { Button, Text } from "@cloudflare/kumo";
import { XIcon } from "@phosphor-icons/react";

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
  return 1000 + safeOffset;
}

// ============ Modal Component ============

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

const Modal = memo(function Modal({
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
  centered = true,
  onClose,
  animationDuration = 200
}: ModalProps) {
  const titleId = `modal-title-${String(id)}`;

  // Handle mask click
  const handleMaskClick = useCallback(() => {
    if (maskClosable) {
      onClose();
    }
  }, [maskClosable, onClose]);

  // Handle Escape key
  useEffect(() => {
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

    if (visible) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll
      document.body.style.overflow = "hidden";
      queueMicrotask(() => {
        const dialog = document.querySelector<HTMLElement>(`[data-modal-id=\"${String(id)}\"]`);
        dialog?.focus();
      });
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
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
          relative bg-kumo-surface rounded-xl shadow-2xl
          ring ring-kumo-line
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
          <div className="flex items-center justify-between px-5 py-4 border-b border-kumo-line">
            {title && (
              <Text size="lg" bold id={titleId}>
                {title}
              </Text>
            )}
            {closable && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-kumo-subtle hover:text-kumo-default hover:bg-kumo-control transition-colors"
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
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-kumo-line">
            {footer || (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
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
 * Must be rendered only once in the app.
 */
export function ModalHost() {
  const { modals } = useModalStack();

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
      {modals.map((modal) => (
        <Modal
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
      ))}
    </>,
    target
  );
}

export { Modal };
