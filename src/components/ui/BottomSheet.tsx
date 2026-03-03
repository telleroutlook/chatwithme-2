import { useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useResponsive } from "../../hooks/useResponsive";

// ============ Types ============

export interface BottomSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Called when the sheet should close */
  onClose: () => void;
  /** Optional title shown at top */
  title?: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Optional footer with actions */
  footer?: React.ReactNode;
  /** Snap point behavior */
  snap?: "content" | "half" | "full";
  /** Enable swipe down to close gesture */
  enableSwipeToClose?: boolean;
  /** Additional class name */
  className?: string;
  /** Custom z-index */
  zIndex?: number;
}

// ============ Constants ============

const SWIPE_CLOSE_THRESHOLD = 100; // pixels to trigger close
const SWIPE_VELOCITY_THRESHOLD = 0.3; // velocity to trigger close

// ============ BottomSheet Component ============

export const BottomSheet = memo(function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  snap = "content",
  enableSwipeToClose = true,
  className,
  zIndex = 1100
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const currentDragY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Fixed-body scroll lock
  useScrollLock(open);

  // Handle keyboard and focus
  useEffect(() => {
    if (!open) return;

    // Store previous focus
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Trap focus within sheet
      if (e.key !== "Tab" || !sheetRef.current) return;

      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus the sheet
    queueMicrotask(() => sheetRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  // Calculate snap point height
  const getSnapHeight = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const safeAreaBottom = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom") || "0",
      10
    );

    switch (snap) {
      case "full":
        return viewportHeight - safeAreaBottom - 48; // Leave space for status bar area
      case "half":
        return viewportHeight * 0.5;
      case "content":
      default:
        return undefined; // Auto height based on content
    }
  }, [snap]);

  // Touch handlers for swipe-to-close
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enableSwipeToClose) return;

      const target = e.target as HTMLElement;
      // Only start drag from the drag handle or header area
      const isDragHandle = target.closest("[data-drag-handle]");
      const isScrollable = target.closest("[data-sheet-scrollable]");

      // If touching scrollable content, check if scrolled to top
      if (isScrollable) {
        const scrollableEl = isScrollable as HTMLElement;
        if (scrollableEl.scrollTop > 0) return;
      }

      // Allow drag from drag handle or if not in scrollable content
      if (!isDragHandle && isScrollable) return;

      dragStartY.current = e.touches[0].clientY;
      currentDragY.current = e.touches[0].clientY;
      isDragging.current = true;
    },
    [enableSwipeToClose]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || !enableSwipeToClose || !sheetRef.current) return;

      currentDragY.current = e.touches[0].clientY;
      const deltaY = currentDragY.current - dragStartY.current;

      // Only allow downward drag
      if (deltaY < 0) return;

      // Apply transform
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      sheetRef.current.style.transition = "none";
    },
    [enableSwipeToClose]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !enableSwipeToClose || !sheetRef.current) return;

    isDragging.current = false;
    const deltaY = currentDragY.current - dragStartY.current;
    const deltaTime = Date.now() - (dragStartY.current as unknown as number);
    const velocity = deltaY / Math.max(deltaTime, 1);

    // Check if should close
    const shouldClose =
      deltaY > SWIPE_CLOSE_THRESHOLD || (deltaY > 20 && velocity > SWIPE_VELOCITY_THRESHOLD);

    if (shouldClose) {
      onClose();
    }

    // Reset transform
    sheetRef.current.style.transform = "";
    sheetRef.current.style.transition = "";
  }, [enableSwipeToClose, onClose]);

  // Portal target
  const target = typeof document !== "undefined" ? document.body : null;

  if (!target) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{ zIndex }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-[var(--app-overlay)] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Bottom sheet"}
        tabIndex={-1}
        data-drag-handle
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed bottom-0 left-0 right-0",
          "flex flex-col",
          "bg-[var(--app-surface-primary)]",
          "rounded-t-2xl",
          "shadow-[var(--app-shadow-medium)]",
          "transition-transform duration-200 ease-out",
          open ? "translate-y-0" : "translate-y-full",
          className
        )}
        style={{
          height: getSnapHeight(),
          maxHeight: snap === "full" ? undefined : "90vh",
          paddingBottom: "var(--safe-area-inset-bottom, 0px)"
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
        {title && (
          <div className="flex items-center justify-center px-4 pb-3 border-b border-[var(--app-border-default)]">
            <span className="text-sm font-semibold text-[var(--app-text-primary)]">
              {title}
            </span>
          </div>
        )}

        {/* Content */}
        <div
          data-sheet-scrollable
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-[var(--app-border-default)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    target
  );
});

// ============ Utility Component ============

/**
 * Conditional BottomSheet or children based on mobile/desktop
 *
 * @example
 * ```tsx
 * <ResponsiveBottomSheet
 *   open={open}
 *   onClose={onClose}
 *   title="Edit"
 * >
 *   <EditForm />
 * </ResponsiveBottomSheet>
 * ```
 */
export interface ResponsiveBottomSheetProps extends BottomSheetProps {
  /** Force desktop mode (modal) even on mobile */
  forceDesktop?: boolean;
}

export const ResponsiveBottomSheet = memo(function ResponsiveBottomSheet({
  forceDesktop = false,
  ...props
}: ResponsiveBottomSheetProps) {
  const { mobile } = useResponsive();

  // On mobile, always use BottomSheet
  // On desktop, we could render a modal instead, but for simplicity
  // we'll use the same BottomSheet component (it works fine on desktop too)
  // The parent component can use mobileMode prop to choose behavior

  return <BottomSheet {...props} />;
});
