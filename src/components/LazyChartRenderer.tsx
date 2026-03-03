import { lazy, Suspense, memo, type ReactNode } from "react";
import { ChartSkeleton } from "./skeletons";
import type { ParsedAdcSpec } from "../utils/adcSpecParser";

// Lazy load the heavy chart components (these include the actual rendering logic)
const MermaidRendererLazy = lazy(() =>
  import("./ChartRenderer").then((m) => ({ default: m.MermaidRenderer }))
);

const G2ChartRendererLazy = lazy(() =>
  import("./ChartRenderer").then((m) => ({ default: m.G2ChartRenderer }))
);

const AntDesignChartsRendererLazy = lazy(() =>
  import("./AntDesignChartsRenderer").then((m) => ({ default: m.LazyAntDesignChartsRenderer }))
);

interface LazyMermaidRendererProps {
  code: string;
  animated?: boolean;
}

interface LazyG2ChartRendererProps {
  spec: {
    type?: string;
    data?: Record<string, unknown>[] | Record<string, unknown>;
    encode?: Record<string, string | number>;
    axis?: Record<string, unknown>;
    legend?: Record<string, unknown>;
    scale?: Record<string, unknown>;
    style?: Record<string, unknown>;
    children?: unknown[];
    marks?: unknown[];
  };
  animated?: boolean;
}

/**
 * Lazy-loaded Mermaid renderer with skeleton fallback
 */
export const LazyMermaidRenderer = memo(function LazyMermaidRenderer({
  code,
  animated = false,
}: LazyMermaidRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="mermaid" />}>
      <MermaidRendererLazy code={code} animated={animated} />
    </Suspense>
  );
});

/**
 * Lazy-loaded G2 chart renderer with skeleton fallback
 */
export const LazyG2ChartRenderer = memo(function LazyG2ChartRenderer({
  spec,
  animated = false,
}: LazyG2ChartRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="g2" />}>
      <G2ChartRendererLazy spec={spec} animated={animated} />
    </Suspense>
  );
});

interface LazyAntDesignChartsRendererProps {
  spec: ParsedAdcSpec;
  animated?: boolean;
}

/**
 * Lazy-loaded Ant Design Charts renderer with skeleton fallback
 */
export const LazyAntDesignChartsRenderer = memo(function LazyAntDesignChartsRenderer({
  spec,
  animated = false,
}: LazyAntDesignChartsRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="adc" />}>
      <AntDesignChartsRendererLazy spec={spec} animated={animated} />
    </Suspense>
  );
});

// Re-export the parser functions for immediate use (they are pure functions, no side effects)
export { parseG2SpecFromCode } from "../utils/g2SpecParser";
export { parseAdcSpecFromCode } from "../utils/adcSpecParser";
