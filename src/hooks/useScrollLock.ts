import { useEffect, useRef } from "react";

/**
 * Fixed-body scroll lock technique
 *
 * Prevents iOS viewport jump when opening/closing modals by using
 * position: fixed instead of overflow: hidden.
 *
 * @param locked - Whether scroll should be locked
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 * useScrollLock(open);
 * ```
 */
export function useScrollLock(locked: boolean): void {
  const scrollYRef = useRef<number>(0);

  useEffect(() => {
    if (!locked) {
      return;
    }

    // Store current scroll position
    scrollYRef.current = window.scrollY;

    // Apply fixed position to prevent scroll and maintain visual position
    const scrollY = scrollYRef.current;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      // Restore original styles
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

/**
 * Imperative scroll lock control
 *
 * Use this when you need to lock/unlock scroll outside of React lifecycle
 *
 * @example
 * ```tsx
 * const lock = useScrollLockImperative();
 *
 * lock.lock();
 * // ... later
 * lock.unlock();
 * ```
 */
export function useScrollLockImperative() {
  const scrollYRef = useRef<number>(0);
  const isLockedRef = useRef<boolean>(false);

  const lock = () => {
    if (isLockedRef.current) return;

    scrollYRef.current = window.scrollY;
    const scrollY = scrollYRef.current;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    isLockedRef.current = true;
  };

  const unlock = () => {
    if (!isLockedRef.current) return;

    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";

    window.scrollTo(0, scrollYRef.current);
    isLockedRef.current = false;
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (isLockedRef.current) {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
      }
    };
  }, []);

  return { lock, unlock, isLocked: () => isLockedRef.current };
}
