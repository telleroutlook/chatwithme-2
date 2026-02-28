import { useState, useEffect, useCallback, useMemo } from "react";

// ============ Types ============

export interface ResponsiveInfo {
  /** Mobile device (< 640px) */
  mobile: boolean;
  /** Tablet device (640px - 1024px) */
  tablet: boolean;
  /** Desktop device (> 1024px) */
  desktop: boolean;
  /** Current breakpoint name */
  breakpoint: "mobile" | "tablet" | "desktop";
  /** Current window width */
  width: number;
  /** Current window height */
  height: number;
  /** Whether device supports touch */
  touch: boolean;
  /** Whether device is in landscape orientation */
  landscape: boolean;
  /** Whether device is in portrait orientation */
  portrait: boolean;
}

// ============ Breakpoints ============

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536
} as const;

type BreakpointName = keyof typeof BREAKPOINTS;

// ============ Hook ============

/**
 * Hook for responsive design breakpoints and device detection
 *
 * Features:
 * - Mobile/tablet/desktop detection
 * - Current breakpoint info
 * - Touch device detection
 * - Orientation detection
 * - SSR-safe
 *
 * @example
 * ```tsx
 * const { mobile, tablet, desktop, breakpoint } = useResponsive();
 *
 * if (mobile) {
 *   return <Drawer {...props} />;
 * }
 * return <Modal {...props} />;
 * ```
 */
export function useResponsive(): ResponsiveInfo {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768
  });

  const [touch, setTouch] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    const handleTouch = () => {
      setTouch(true);
    };

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(document.documentElement);

    // Fallback to resize event
    window.addEventListener("resize", handleResize);
    window.addEventListener("touchstart", handleTouch, { once: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("touchstart", handleTouch);
    };
  }, []);

  const { width, height } = dimensions;

  const responsive = useMemo<ResponsiveInfo>(() => {
    const mobile = width < BREAKPOINTS.sm;
    const tablet = width >= BREAKPOINTS.sm && width < BREAKPOINTS.lg;
    const desktop = width >= BREAKPOINTS.lg;

    let breakpoint: "mobile" | "tablet" | "desktop";
    if (mobile) {
      breakpoint = "mobile";
    } else if (tablet) {
      breakpoint = "tablet";
    } else {
      breakpoint = "desktop";
    }

    return {
      mobile,
      tablet,
      desktop,
      breakpoint,
      width,
      height,
      touch,
      landscape: width > height,
      portrait: width <= height
    };
  }, [width, height, touch]);

  return responsive;
}

// ============ Media Query Hook ============

/**
 * Hook for checking if a media query matches
 *
 * @example
 * ```tsx
 * const isLargeScreen = useMediaQuery("(min-width: 1024px)");
 * const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// ============ Breakpoint Hook ============

/**
 * Hook for checking if viewport is at or above a breakpoint
 *
 * @example
 * ```tsx
 * const isMd = useBreakpoint("md"); // true if width >= 768px
 * ```
 */
export function useBreakpoint(breakpoint: BreakpointName): boolean {
  const minWidth = BREAKPOINTS[breakpoint];
  return useMediaQuery(`(min-width: ${minWidth}px)`);
}

// ============ Container Query Hook ============

interface UseContainerQueryOptions {
  /** Container ref to observe */
  ref: React.RefObject<HTMLElement | null>;
  /** Width threshold */
  width?: number;
  /** Height threshold */
  height?: number;
}

/**
 * Hook for container queries (element size detection)
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { width, height, matches } = useContainerQuery({
 *   ref: containerRef,
 *   width: 400,
 * });
 * ```
 */
export function useContainerQuery(options: UseContainerQueryOptions): {
  width: number;
  height: number;
  matches: boolean;
} {
  const { ref, width: widthThreshold, height: heightThreshold } = options;

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0] || {
          inlineSize: entry.contentRect.width,
          blockSize: entry.contentRect.height
        };
        setSize({ width, height });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  const matches = useMemo(() => {
    if (widthThreshold !== undefined && size.width < widthThreshold) {
      return false;
    }
    if (heightThreshold !== undefined && size.height < heightThreshold) {
      return false;
    }
    return true;
  }, [size, widthThreshold, heightThreshold]);

  return { ...size, matches };
}

// ============ Utility Functions ============

/**
 * Check if device is mobile (no hooks, for one-time checks)
 */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < BREAKPOINTS.sm;
}

/**
 * Check if device supports touch (no hooks, for one-time checks)
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * Get current breakpoint name (no hooks, for one-time checks)
 */
export function getCurrentBreakpoint(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;

  if (width < BREAKPOINTS.sm) return "mobile";
  if (width < BREAKPOINTS.lg) return "tablet";
  return "desktop";
}
