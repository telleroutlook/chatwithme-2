/**
 * DashboardRenderer — renders a composite dashboard with multiple items
 * (stat cards, ADC charts, ECharts, text) in a responsive grid layout.
 *
 * Each item is wrapped in its own error boundary so one broken item
 * does not take down the whole dashboard.
 */

import { memo, useMemo, type ReactNode } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import type { DashboardSpec, DashboardItem } from "../utils/dashboardParser";
import type { ParsedAdcSpec } from "../utils/adcSpecParser";
import type { EChartsOption } from "../utils/ecSpecParser";
import type { StatCardItem } from "../utils/statCardParser";
import { StatCard } from "./StatCard";
import {
  LazyAntDesignChartsRenderer,
  LazyEChartsRenderer,
} from "./LazyChartRenderer";
import { ErrorBoundary } from "./ErrorBoundary";
import { MarkdownRenderer } from "./MarkdownRenderer";

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Parse the layout string to determine grid column count.
 * Formats: "2x2", "3x1", "1x3", "2x1", "1x2", "auto", or undefined.
 */
function resolveGridCols(layout: string | undefined, itemCount: number): number {
  if (!layout || layout === "auto") {
    // Auto-detect based on item count
    if (itemCount <= 2) return 1;
    if (itemCount <= 4) return 2;
    return 3;
  }

  // Parse NxM format — use the first number as columns
  const match = layout.match(/^(\d+)x(\d+)$/);
  if (match) {
    const cols = parseInt(match[1], 10);
    if (cols >= 1 && cols <= 4) return cols;
  }

  // Fallback to auto
  if (itemCount <= 2) return 1;
  if (itemCount <= 4) return 2;
  return 3;
}

// Tailwind grid-cols classes (must be statically analyzable)
const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

// Tailwind col-span classes (must be statically analyzable)
const COL_SPAN_CLASS: Record<number, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

// ---------------------------------------------------------------------------
// Item renderers
// ---------------------------------------------------------------------------

function DashboardStatItem({ data }: { data: unknown }): ReactNode {
  const items = data as StatCardItem[];
  return <StatCard data={items} />;
}

function DashboardAdcItem({ data }: { data: unknown }): ReactNode {
  const spec = data as ParsedAdcSpec;
  return <LazyAntDesignChartsRenderer spec={spec} />;
}

function DashboardEChartsItem({ data }: { data: unknown }): ReactNode {
  const spec = data as EChartsOption;
  return <LazyEChartsRenderer spec={spec} />;
}

function DashboardTextItem({ data }: { data: unknown }): ReactNode {
  const text = data as string;
  return (
    <div className="p-4">
      <MarkdownRenderer content={text} />
    </div>
  );
}

function DashboardItemError({ type, index }: { type: string; index: number }): ReactNode {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] text-xs text-foreground-muted">
      Failed to render {type} item #{index + 1}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single dashboard item wrapper
// ---------------------------------------------------------------------------

interface DashboardItemWrapperProps {
  item: DashboardItem;
  index: number;
}

const DashboardItemWrapper = memo(function DashboardItemWrapper({
  item,
  index,
}: DashboardItemWrapperProps): ReactNode {
  const spanClass = COL_SPAN_CLASS[item.span ?? 1] ?? "";

  // Stat cards render without the card wrapper (they have their own styling)
  if (item.type === "stat") {
    return (
      <div className={`${spanClass}`}>
        <ErrorBoundary
          level="chart"
          fallback={<DashboardItemError type={item.type} index={index} />}
        >
          <DashboardStatItem data={item.data} />
        </ErrorBoundary>
      </div>
    );
  }

  // ADC and ECharts already render in their own styled containers
  if (item.type === "adc" || item.type === "echarts") {
    return (
      <div className={`${spanClass} min-h-[200px]`}>
        <ErrorBoundary
          level="chart"
          fallback={<DashboardItemError type={item.type} index={index} />}
        >
          {item.type === "adc" ? (
            <DashboardAdcItem data={item.data} />
          ) : (
            <DashboardEChartsItem data={item.data} />
          )}
        </ErrorBoundary>
      </div>
    );
  }

  // Text items get a card wrapper
  return (
    <div
      className={`rounded-lg border border-border bg-surface-elevated overflow-hidden ${spanClass}`}
    >
      <ErrorBoundary
        level="chart"
        fallback={<DashboardItemError type={item.type} index={index} />}
      >
        <DashboardTextItem data={item.data} />
      </ErrorBoundary>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main DashboardRenderer
// ---------------------------------------------------------------------------

export interface DashboardRendererProps {
  spec: DashboardSpec;
}

export const DashboardRenderer = memo(function DashboardRenderer({
  spec,
}: DashboardRendererProps): ReactNode {
  const gridCols = useMemo(
    () => resolveGridCols(spec.layout, spec.items.length),
    [spec.layout, spec.items.length],
  );

  const gridClass = GRID_COLS_CLASS[gridCols] ?? GRID_COLS_CLASS[2];

  return (
    <div className="w-full my-3 not-prose" role="region" aria-label={spec.title ?? "Dashboard"}>
      {/* Title */}
      {spec.title && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <SquaresFour size={16} className="text-accent" weight="duotone" />
          <h3 className="text-sm font-semibold text-foreground">{spec.title}</h3>
        </div>
      )}

      {/* Grid */}
      <div className={`grid grid-cols-1 ${gridClass} gap-3`}>
        {spec.items.map((item, index) => (
          <DashboardItemWrapper
            key={`dashboard-item-${index}`}
            item={item}
            index={index}
          />
        ))}
      </div>
    </div>
  );
});
