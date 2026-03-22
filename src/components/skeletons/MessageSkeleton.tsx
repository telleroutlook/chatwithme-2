import { memo } from "react";
import type { ChartSkeletonType } from "../../utils/streamingChartDetector";

// Detect user language once at module load time
const isChinese = navigator.language.startsWith("zh");
const RENDERING_LABEL = isChinese ? "渲染中，请稍候" : "Rendering, please wait…";

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

/**
 * Base skeleton with shimmer animation
 */
export const Skeleton = memo(function Skeleton({
  className = "",
  animate = true,
}: SkeletonProps) {
  return (
    <div
      className={`bg-border/50 rounded ${animate ? "animate-pulse" : ""} ${className}`}
      aria-hidden="true"
    />
  );
});

interface MessageSkeletonProps {
  variant?: "user" | "assistant";
  animate?: boolean;
}

/**
 * Skeleton for chat message loading state
 */
export const MessageSkeleton = memo(function MessageSkeleton({
  variant = "assistant",
  animate = true,
}: MessageSkeletonProps) {
  const isUser = variant === "user";

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-2`}
      aria-busy="true"
      aria-label="Loading message"
    >
      {/* Message bubble */}
      <div
        className={`rounded-2xl px-4 py-2.5 ring ring-border ${
          isUser ? "bg-accent/20" : "bg-surface-elevated/95"
        } ${isUser ? "w-fit max-w-[70%]" : "w-full max-w-[85%]"}`}
      >
        {isUser ? (
          // User message - typically short
          <Skeleton className="h-4 w-24" animate={animate} />
        ) : (
          // Assistant message - multiple lines
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" animate={animate} />
            <Skeleton className="h-4 w-4/5" animate={animate} />
            <Skeleton className="h-4 w-3/5" animate={animate} />
          </div>
        )}
      </div>

      {/* Actions placeholder */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-md" animate={animate} />
        <Skeleton className="h-5 w-12 rounded-md" animate={animate} />
      </div>
    </div>
  );
});

interface ChartSkeletonProps {
  type?: "mermaid" | "echarts";
  animate?: boolean;
}

// Predefined heights for bar chart skeleton
const BAR_HEIGHTS = ["h-12", "h-20", "h-14", "h-24", "h-16", "h-22", "h-14"];

/**
 * Skeleton for chart loading state (used by Suspense fallbacks in LazyChartRenderer)
 */
export const ChartSkeleton = memo(function ChartSkeleton({
  type = "echarts",
  animate = true,
}: ChartSkeletonProps) {
  return (
    <div className="w-full rounded-xl p-4 ring ring-border bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-4 w-4 rounded" animate={animate} />
        <Skeleton className="h-4 w-20" animate={animate} />
        <span
          className="ml-auto text-xs text-foreground-muted animate-[pulse_2s_ease-in-out_infinite]"
          aria-live="polite"
        >
          {RENDERING_LABEL}
        </span>
      </div>
      {/* Chart area */}
      <div className="relative" style={{ minHeight: 200 }}>
        {type === "mermaid" ? (
          // Flowchart style skeleton
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex gap-4">
              <Skeleton className="h-12 w-24 rounded-lg" animate={animate} />
              <Skeleton className="h-12 w-24 rounded-lg" animate={animate} />
            </div>
            <Skeleton className="h-8 w-1" animate={animate} />
            <Skeleton className="h-12 w-32 rounded-lg" animate={animate} />
          </div>
        ) : (
          // Bar chart style skeleton
          <div className="flex items-end justify-center gap-2 h-48">
            {BAR_HEIGHTS.map((heightClass, i) => (
              <Skeleton
                key={i}
                className={`w-8 rounded-t ${heightClass}`}
                animate={animate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Type-aware chart skeleton for streaming code blocks (Phase 4.4)
// ---------------------------------------------------------------------------

interface ChartTypeSkeletonProps {
  type: ChartSkeletonType;
}

/**
 * SVG-based skeleton that approximates the layout of each chart type.
 * Shown while a chart code block is still streaming (incomplete JSON).
 *
 * Pure CSS + inline SVG — no heavy dependencies.
 */
export const ChartTypeSkeleton = memo(function ChartTypeSkeleton({
  type,
}: ChartTypeSkeletonProps) {
  return (
    <div
      className="w-full my-3 rounded-xl ring ring-border bg-surface-elevated overflow-hidden animate-pulse"
      aria-busy="true"
      aria-label="Loading chart"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="h-3.5 w-3.5 rounded bg-border/60" />
        <div className="h-3.5 w-24 rounded bg-border/60" />
        <div className="flex-1" />
        <span
          className="text-xs text-foreground-muted animate-[pulse_2s_ease-in-out_infinite]"
          aria-live="polite"
        >
          {RENDERING_LABEL}
        </span>
      </div>

      {/* Chart body — delegates to a per-type SVG */}
      <div className="p-4" style={{ minHeight: 220 }}>
        {renderSkeletonSvg(type)}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Per-type SVG renderers (lightweight, theme-aware via currentColor)
// ---------------------------------------------------------------------------

function renderSkeletonSvg(type: ChartSkeletonType): React.ReactNode {
  switch (type) {
    case "line":
      return <LineChartSkeleton />;
    case "bar":
      return <BarChartSkeleton />;
    case "pie":
      return <PieChartSkeleton />;
    case "mermaid":
      return <MermaidSkeleton />;
    case "echarts":
      return <EChartsGenericSkeleton />;
    case "stat":
      return <StatCardSkeleton />;
    case "generic":
    default:
      return <GenericChartSkeleton />;
  }
}

/** Animated wavy line chart with axes and label placeholders. */
function LineChartSkeleton() {
  return (
    <svg
      viewBox="0 0 400 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Y axis */}
      <line x1="40" y1="10" x2="40" y2="170" className="stroke-border" strokeWidth="1" />
      {/* X axis */}
      <line x1="40" y1="170" x2="380" y2="170" className="stroke-border" strokeWidth="1" />

      {/* Y-axis tick labels */}
      <rect x="8" y="25" width="24" height="8" rx="2" className="fill-border/40" />
      <rect x="14" y="65" width="18" height="8" rx="2" className="fill-border/40" />
      <rect x="10" y="105" width="22" height="8" rx="2" className="fill-border/40" />
      <rect x="12" y="145" width="20" height="8" rx="2" className="fill-border/40" />

      {/* X-axis tick labels */}
      <rect x="65" y="178" width="30" height="7" rx="2" className="fill-border/40" />
      <rect x="135" y="178" width="30" height="7" rx="2" className="fill-border/40" />
      <rect x="205" y="178" width="30" height="7" rx="2" className="fill-border/40" />
      <rect x="275" y="178" width="30" height="7" rx="2" className="fill-border/40" />
      <rect x="345" y="178" width="30" height="7" rx="2" className="fill-border/40" />

      {/* Grid lines (horizontal) */}
      <line x1="40" y1="30" x2="380" y2="30" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="70" x2="380" y2="70" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="110" x2="380" y2="110" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />

      {/* Wavy line */}
      <path
        d="M50 130 C80 130, 90 60, 120 80 S170 140, 200 100 S240 30, 270 70 S320 120, 350 50 L370 60"
        className="stroke-border/60"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Data points */}
      <circle cx="50" cy="130" r="3.5" className="fill-border/50" />
      <circle cx="120" cy="80" r="3.5" className="fill-border/50" />
      <circle cx="200" cy="100" r="3.5" className="fill-border/50" />
      <circle cx="270" cy="70" r="3.5" className="fill-border/50" />
      <circle cx="350" cy="50" r="3.5" className="fill-border/50" />
      <circle cx="370" cy="60" r="3.5" className="fill-border/50" />

      {/* Legend placeholder */}
      <rect x="150" y="192" width="8" height="4" rx="1" className="fill-border/40" />
      <rect x="162" y="192" width="36" height="4" rx="1" className="fill-border/30" />
      <rect x="210" y="192" width="8" height="4" rx="1" className="fill-border/40" />
      <rect x="222" y="192" width="36" height="4" rx="1" className="fill-border/30" />
    </svg>
  );
}

/** Bar chart with varying-height bars, axes, and label placeholders. */
function BarChartSkeleton() {
  const barData = [
    { x: 65, h: 80 },
    { x: 110, h: 120 },
    { x: 155, h: 60 },
    { x: 200, h: 140 },
    { x: 245, h: 95 },
    { x: 290, h: 110 },
    { x: 335, h: 70 },
  ];

  return (
    <svg
      viewBox="0 0 400 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Y axis */}
      <line x1="40" y1="10" x2="40" y2="170" className="stroke-border" strokeWidth="1" />
      {/* X axis */}
      <line x1="40" y1="170" x2="380" y2="170" className="stroke-border" strokeWidth="1" />

      {/* Y-axis labels */}
      <rect x="10" y="25" width="22" height="8" rx="2" className="fill-border/40" />
      <rect x="14" y="65" width="18" height="8" rx="2" className="fill-border/40" />
      <rect x="10" y="105" width="22" height="8" rx="2" className="fill-border/40" />
      <rect x="14" y="145" width="18" height="8" rx="2" className="fill-border/40" />

      {/* Grid lines */}
      <line x1="40" y1="30" x2="380" y2="30" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="70" x2="380" y2="70" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="110" x2="380" y2="110" className="stroke-border/20" strokeWidth="1" strokeDasharray="4 4" />

      {/* Bars */}
      {barData.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={170 - bar.h}
          width="30"
          height={bar.h}
          rx="3"
          className="fill-border/40"
        />
      ))}

      {/* X-axis labels */}
      {barData.map((bar, i) => (
        <rect
          key={`label-${i}`}
          x={bar.x + 5}
          y={178}
          width="20"
          height="7"
          rx="2"
          className="fill-border/30"
        />
      ))}
    </svg>
  );
}

/** Pie/donut chart with sector segments. */
function PieChartSkeleton() {
  // Create 4 arc segments using SVG paths
  return (
    <svg
      viewBox="0 0 300 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Donut segments — 4 sectors at different opacities */}
      <g transform="translate(120, 100)">
        {/* Sector 1: 0° to 120° */}
        <path
          d="M0,-70 A70,70 0 0,1 60.62,35 L42.43,24.5 A49,49 0 0,0 0,-49 Z"
          className="fill-border/50"
        />
        {/* Sector 2: 120° to 210° */}
        <path
          d="M60.62,35 A70,70 0 0,1 -35,60.62 L-24.5,42.43 A49,49 0 0,0 42.43,24.5 Z"
          className="fill-border/35"
        />
        {/* Sector 3: 210° to 300° */}
        <path
          d="M-35,60.62 A70,70 0 0,1 -60.62,-35 L-42.43,-24.5 A49,49 0 0,0 -24.5,42.43 Z"
          className="fill-border/25"
        />
        {/* Sector 4: 300° to 360° */}
        <path
          d="M-60.62,-35 A70,70 0 0,1 0,-70 L0,-49 A49,49 0 0,0 -42.43,-24.5 Z"
          className="fill-border/40"
        />
      </g>

      {/* Legend on the right */}
      <g transform="translate(210, 55)">
        <rect x="0" y="0" width="10" height="10" rx="2" className="fill-border/50" />
        <rect x="16" y="1" width="50" height="8" rx="2" className="fill-border/30" />

        <rect x="0" y="25" width="10" height="10" rx="2" className="fill-border/35" />
        <rect x="16" y="26" width="40" height="8" rx="2" className="fill-border/30" />

        <rect x="0" y="50" width="10" height="10" rx="2" className="fill-border/25" />
        <rect x="16" y="51" width="55" height="8" rx="2" className="fill-border/30" />

        <rect x="0" y="75" width="10" height="10" rx="2" className="fill-border/40" />
        <rect x="16" y="76" width="35" height="8" rx="2" className="fill-border/30" />
      </g>
    </svg>
  );
}

/** Mermaid diagram skeleton — rounded boxes connected by lines. */
function MermaidSkeleton() {
  return (
    <svg
      viewBox="0 0 400 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Top row — 2 boxes */}
      <rect x="80" y="15" width="100" height="36" rx="8" className="fill-border/30 stroke-border/50" strokeWidth="1.5" />
      <rect x="93" y="27" width="74" height="10" rx="3" className="fill-border/40" />

      <rect x="220" y="15" width="100" height="36" rx="8" className="fill-border/30 stroke-border/50" strokeWidth="1.5" />
      <rect x="233" y="27" width="74" height="10" rx="3" className="fill-border/40" />

      {/* Arrows from top to middle */}
      <line x1="130" y1="51" x2="130" y2="80" className="stroke-border/40" strokeWidth="1.5" />
      <polygon points="126,76 130,84 134,76" className="fill-border/40" />

      <line x1="270" y1="51" x2="270" y2="80" className="stroke-border/40" strokeWidth="1.5" />
      <polygon points="266,76 270,84 274,76" className="fill-border/40" />

      {/* Middle row — 1 wide box */}
      <rect x="120" y="84" width="160" height="36" rx="8" className="fill-border/30 stroke-border/50" strokeWidth="1.5" />
      <rect x="148" y="96" width="104" height="10" rx="3" className="fill-border/40" />

      {/* Arrow from middle to bottom */}
      <line x1="200" y1="120" x2="200" y2="148" className="stroke-border/40" strokeWidth="1.5" />
      <polygon points="196,144 200,152 204,144" className="fill-border/40" />

      {/* Bottom row — 1 diamond */}
      <polygon
        points="200,152 240,172 200,192 160,172"
        className="fill-border/25 stroke-border/50"
        strokeWidth="1.5"
      />
      <rect x="180" y="167" width="40" height="8" rx="2" className="fill-border/35" />
    </svg>
  );
}

/** ECharts generic skeleton — bar/line combo with a toolbox placeholder. */
function EChartsGenericSkeleton() {
  const barData = [
    { x: 70, h: 90 },
    { x: 120, h: 60 },
    { x: 170, h: 110 },
    { x: 220, h: 75 },
    { x: 270, h: 130 },
    { x: 320, h: 85 },
  ];

  return (
    <svg
      viewBox="0 0 400 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Toolbox icons (top-right) */}
      <rect x="330" y="5" width="12" height="12" rx="2" className="fill-border/25" />
      <rect x="348" y="5" width="12" height="12" rx="2" className="fill-border/25" />
      <rect x="366" y="5" width="12" height="12" rx="2" className="fill-border/25" />

      {/* Y axis */}
      <line x1="50" y1="20" x2="50" y2="170" className="stroke-border" strokeWidth="1" />
      {/* X axis */}
      <line x1="50" y1="170" x2="380" y2="170" className="stroke-border" strokeWidth="1" />

      {/* Y labels */}
      <rect x="14" y="32" width="28" height="7" rx="2" className="fill-border/35" />
      <rect x="18" y="72" width="24" height="7" rx="2" className="fill-border/35" />
      <rect x="14" y="112" width="28" height="7" rx="2" className="fill-border/35" />
      <rect x="18" y="152" width="24" height="7" rx="2" className="fill-border/35" />

      {/* Grid lines */}
      <line x1="50" y1="37" x2="380" y2="37" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="50" y1="77" x2="380" y2="77" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="50" y1="117" x2="380" y2="117" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />

      {/* Bars */}
      {barData.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={170 - bar.h}
          width="28"
          height={bar.h}
          rx="2"
          className="fill-border/30"
        />
      ))}

      {/* Overlay line */}
      <path
        d="M84 110 L134 130 L184 70 L234 120 L284 45 L334 90"
        className="stroke-border/50"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* X labels */}
      {barData.map((bar, i) => (
        <rect
          key={`xl-${i}`}
          x={bar.x + 2}
          y={178}
          width="24"
          height="7"
          rx="2"
          className="fill-border/30"
        />
      ))}
    </svg>
  );
}

/** Stat card skeleton — row of 3 KPI cards. */
function StatCardSkeleton() {
  return (
    <div className="flex flex-wrap gap-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex-1 min-w-[130px] rounded-lg border border-border/50 bg-surface-elevated/60 p-4"
        >
          <div className="h-3 w-16 rounded bg-border/40 mb-3" />
          <div className="h-7 w-24 rounded bg-border/50 mb-2" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-border/35" />
            <div className="h-3 w-14 rounded bg-border/35" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Fallback generic skeleton when chart type is unknown. */
function GenericChartSkeleton() {
  return (
    <svg
      viewBox="0 0 400 200"
      className="w-full h-auto max-h-[220px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Y axis */}
      <line x1="40" y1="10" x2="40" y2="170" className="stroke-border" strokeWidth="1" />
      {/* X axis */}
      <line x1="40" y1="170" x2="380" y2="170" className="stroke-border" strokeWidth="1" />

      {/* Grid lines */}
      <line x1="40" y1="50" x2="380" y2="50" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="90" x2="380" y2="90" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="40" y1="130" x2="380" y2="130" className="stroke-border/15" strokeWidth="1" strokeDasharray="4 4" />

      {/* Abstract shape suggesting a chart area */}
      <path
        d="M50 150 L100 120 L150 130 L200 80 L250 95 L300 55 L350 70 L370 60"
        className="stroke-border/40"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 150 L100 120 L150 130 L200 80 L250 95 L300 55 L350 70 L370 60 L370 170 L50 170 Z"
        className="fill-border/10"
      />

      {/* Y labels */}
      <rect x="10" y="45" width="22" height="7" rx="2" className="fill-border/30" />
      <rect x="14" y="85" width="18" height="7" rx="2" className="fill-border/30" />
      <rect x="10" y="125" width="22" height="7" rx="2" className="fill-border/30" />

      {/* X labels */}
      <rect x="80" y="178" width="30" height="7" rx="2" className="fill-border/30" />
      <rect x="170" y="178" width="30" height="7" rx="2" className="fill-border/30" />
      <rect x="260" y="178" width="30" height="7" rx="2" className="fill-border/30" />
      <rect x="345" y="178" width="30" height="7" rx="2" className="fill-border/30" />

      {/* Center placeholder text */}
      <rect x="155" y="192" width="90" height="6" rx="2" className="fill-border/20" />
    </svg>
  );
}

interface CodeSkeletonProps {
  lines?: number;
  animate?: boolean;
}

/**
 * Skeleton for code block loading state
 */
export const CodeSkeleton = memo(function CodeSkeleton({
  lines = 5,
  animate = true,
}: CodeSkeletonProps) {
  // Predefined widths for code lines
  const lineWidths = ["w-3/5", "w-4/5", "w-2/3", "w-3/4", "w-1/2", "w-4/6", "w-3/5"];

  return (
    <div className="rounded-lg bg-surface-elevated/95 ring ring-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <Skeleton className="h-4 w-16" animate={animate} />
        <div className="flex gap-1">
          <Skeleton className="h-4 w-4 rounded" animate={animate} />
          <Skeleton className="h-4 w-4 rounded" animate={animate} />
        </div>
      </div>
      {/* Code lines */}
      <div className="p-3 space-y-1">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-4 w-4 flex-shrink-0" animate={animate} />
            <Skeleton
              className={`h-4 flex-1 ${lineWidths[i % lineWidths.length]}`}
              animate={animate}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Skeleton list for multiple messages
 */
export const MessageSkeletonList = memo(function MessageSkeletonList({
  count = 3,
  animate = true,
}: {
  count?: number;
  animate?: boolean;
}) {
  return (
    <div className="space-y-4 px-1 py-1 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <MessageSkeleton
          key={i}
          variant={i % 2 === 0 ? "user" : "assistant"}
          animate={animate}
        />
      ))}
    </div>
  );
});
