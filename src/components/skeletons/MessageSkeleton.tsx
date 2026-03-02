import { memo } from "react";
import { Surface } from "@cloudflare/kumo";

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
      className={`bg-kumo-line/50 rounded ${animate ? "animate-pulse" : ""} ${className}`}
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
      <Surface
        className={`rounded-2xl px-4 py-2.5 ring ring-kumo-line ${
          isUser ? "bg-kumo-accent/20" : "bg-kumo-surface/95"
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
      </Surface>

      {/* Actions placeholder */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-md" animate={animate} />
        <Skeleton className="h-5 w-12 rounded-md" animate={animate} />
      </div>
    </div>
  );
});

interface ChartSkeletonProps {
  type?: "mermaid" | "g2";
  animate?: boolean;
}

// Predefined heights for bar chart skeleton
const BAR_HEIGHTS = ["h-12", "h-20", "h-14", "h-24", "h-16", "h-22", "h-14"];

/**
 * Skeleton for chart loading state
 */
export const ChartSkeleton = memo(function ChartSkeleton({
  type = "g2",
  animate = true,
}: ChartSkeletonProps) {
  return (
    <Surface className="w-full rounded-xl p-4 ring ring-kumo-line bg-[var(--surface-elevated)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-4 w-4 rounded" animate={animate} />
        <Skeleton className="h-4 w-20" animate={animate} />
        {type === "g2" && <Skeleton className="h-4 w-12 rounded-full" animate={animate} />}
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
    </Surface>
  );
});

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
    <div className="rounded-lg bg-kumo-surface/95 ring ring-kumo-line overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-kumo-line">
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
