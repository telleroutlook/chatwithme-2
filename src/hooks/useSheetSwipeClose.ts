import { useRef, useCallback } from "react";

// ============ Constants ============

const SWIPE_CLOSE_THRESHOLD = 100; // pixels to trigger close
const SWIPE_VELOCITY_THRESHOLD = 0.3; // velocity to trigger close

// ============ Types ============

export interface SwipeCloseOptions {
  /** Whether swipe-to-close is enabled */
  enabled: boolean;
  /** Called when swipe gesture triggers close */
  onClose: () => void;
  /** Optional ref to the sheet element */
  sheetRef: React.RefObject<HTMLDivElement | null>;
}

export interface SwipeCloseHandlers {
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
  handleTouchCancel: () => void;
}

// ============ Hook ============

/**
 * Shared hook for sheet swipe-to-close gesture handling
 *
 * Provides consistent swipe gesture detection with proper velocity calculation
 * and requestAnimationFrame-based transform updates for smooth animations.
 *
 * @example
 * ```tsx
 * const sheetRef = useRef<HTMLDivElement>(null);
 * const { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel } =
 *   useSheetSwipeClose({ enabled: true, onClose, sheetRef });
 * ```
 */
export function useSheetSwipeClose({
  enabled,
  onClose,
  sheetRef
}: SwipeCloseOptions): SwipeCloseHandlers {
  const dragStartY = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  const currentDragY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const rafId = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const isDragHandle = target.closest("[data-drag-handle]");
      const scrollableEl = target.closest("[data-sheet-scrollable]") as HTMLElement | null;

      // If touching scrollable content, check if scrolled to top
      if (scrollableEl && scrollableEl.scrollTop > 0) return;

      // Allow drag from drag handle or if not in scrollable content
      if (!isDragHandle && scrollableEl) return;

      dragStartY.current = e.touches[0].clientY;
      dragStartTime.current = Date.now();
      currentDragY.current = e.touches[0].clientY;
      isDragging.current = true;
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || !enabled || !sheetRef.current) return;

      currentDragY.current = e.touches[0].clientY;
      const deltaY = currentDragY.current - dragStartY.current;

      // Only allow downward drag
      if (deltaY < 0) return;

      // Use rAF for smooth transform updates
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      rafId.current = requestAnimationFrame(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transform = `translateY(${deltaY}px)`;
          sheetRef.current.style.transition = "none";
        }
      });
    },
    [enabled, sheetRef]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !enabled || !sheetRef.current) return;

    // Cancel any pending rAF
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    isDragging.current = false;
    const deltaY = currentDragY.current - dragStartY.current;
    const deltaTime = Date.now() - dragStartTime.current;
    const velocity = deltaY / Math.max(deltaTime, 1);

    // Check if should close based on distance or velocity
    const shouldClose =
      deltaY > SWIPE_CLOSE_THRESHOLD || (deltaY > 20 && velocity > SWIPE_VELOCITY_THRESHOLD);

    if (shouldClose) {
      onClose();
    }

    // Reset transform
    sheetRef.current.style.transform = "";
    sheetRef.current.style.transition = "";
  }, [enabled, onClose, sheetRef]);

  const handleTouchCancel = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    isDragging.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
      sheetRef.current.style.transition = "";
    }
  }, [sheetRef]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel
  };
}
