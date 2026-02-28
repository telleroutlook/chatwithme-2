import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResponsive, useMediaQuery, useBreakpoint, BREAKPOINTS } from "./useResponsive";

describe("useResponsive", () => {
  it("should return responsive info object", () => {
    const { result } = renderHook(() => useResponsive());

    expect(result.current).toHaveProperty("mobile");
    expect(result.current).toHaveProperty("tablet");
    expect(result.current).toHaveProperty("desktop");
    expect(result.current).toHaveProperty("breakpoint");
    expect(result.current).toHaveProperty("width");
    expect(result.current).toHaveProperty("height");
    expect(result.current).toHaveProperty("touch");
    expect(result.current).toHaveProperty("landscape");
    expect(result.current).toHaveProperty("portrait");
  });

  it("should have correct breakpoint values", () => {
    expect(BREAKPOINTS.sm).toBe(640);
    expect(BREAKPOINTS.md).toBe(768);
    expect(BREAKPOINTS.lg).toBe(1024);
    expect(BREAKPOINTS.xl).toBe(1280);
    expect(BREAKPOINTS["2xl"]).toBe(1536);
  });
});

describe("useMediaQuery", () => {
  it("should return true when media query matches", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(true);
  });

  it("should return false when media query does not match", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    const { result } = renderHook(() => useMediaQuery("(min-width: 9999px)"));
    expect(result.current).toBe(false);
  });
});

describe("useBreakpoint", () => {
  it("should return true for md breakpoint when width >= 768", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 768px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    const { result } = renderHook(() => useBreakpoint("md"));
    expect(result.current).toBe(true);
  });
});
