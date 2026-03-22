/**
 * ChartEditor — slide-out drawer for editing chart JSON specs with live preview.
 *
 * Features:
 * - CodeMirror JSON editor (lazy-loaded)
 * - Live preview with 300ms debounce
 * - Quick action buttons for title and chart type
 * - Dark/light theme support
 * - Portal-based rendering to avoid z-index issues
 * - Escape key and backdrop click to close
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useThemeDetector } from "../hooks/useThemeDetector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartEditorEngine = "echarts";

export interface ChartEditorProps {
  spec: Record<string, unknown>;
  engine: ChartEditorEngine;
  onApply: (newSpec: Record<string, unknown>) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Lazy CodeMirror wrapper
// ---------------------------------------------------------------------------

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
}

const LazyCodeMirrorEditor = lazy(() => import("./ChartEditorCodeMirror"));

function CodeMirrorFallback(): ReactNode {
  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Loading editor...
      </span>
    </div>
  );
}

function CodeMirrorEditor({ value, onChange, isDark }: CodeMirrorEditorProps): ReactNode {
  return (
    <Suspense fallback={<CodeMirrorFallback />}>
      <LazyCodeMirrorEditor value={value} onChange={onChange} isDark={isDark} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// ECharts preview (self-contained, no circular dependency)
// ---------------------------------------------------------------------------

function EChartsPreview({ spec }: { spec: Record<string, unknown> }): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ReturnType<typeof import("echarts")["init"]> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const isDark = useThemeDetector();

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      if (!containerRef.current) return;
      const echarts = await import("echarts");
      if (disposed) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }

      const theme = isDark ? "dark" : undefined;
      const chart = echarts.init(containerRef.current, theme, { renderer: "svg" });
      chartInstanceRef.current = chart;
      chart.setOption(spec, true);

      const ro = new ResizeObserver(() => {
        if (!disposed && chart && !chart.isDisposed()) chart.resize();
      });
      ro.observe(containerRef.current);
      roRef.current = ro;
    };

    run();

    return () => {
      disposed = true;
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [spec, isDark]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

// ---------------------------------------------------------------------------
// Quick Actions: chart type options
// ---------------------------------------------------------------------------

const ECHARTS_TYPE_OPTIONS = ["bar", "line", "scatter", "pie"] as const;

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChartEditor({
  spec,
  engine,
  onApply,
  onClose,
}: ChartEditorProps): ReactNode {
  const isDark = useThemeDetector();
  const originalSpecJson = useMemo(() => JSON.stringify(spec, null, 2), [spec]);

  // Editor state
  const [jsonText, setJsonText] = useState(originalSpecJson);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Parse the JSON for preview (debounced)
  const debouncedJson = useDebouncedValue(jsonText, 300);

  const parsedSpec = useMemo<Record<string, unknown> | null>(() => {
    try {
      const parsed = JSON.parse(debouncedJson) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setParseError("Spec must be a JSON object");
        return null;
      }
      setParseError(null);
      return parsed as Record<string, unknown>;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      return null;
    }
  }, [debouncedJson]);

  // Quick action: extract title
  const currentTitle = useMemo(() => {
    if (!parsedSpec) return "";
    const title = parsedSpec.title;
    if (typeof title === "string") return title;
    if (title && typeof title === "object" && !Array.isArray(title)) {
      const t = title as Record<string, unknown>;
      if (typeof t.text === "string") return t.text;
    }
    return "";
  }, [parsedSpec]);

  // Quick action: extract chart type
  const currentChartType = useMemo(() => {
    if (!parsedSpec) return "";
    // ECharts: detect from series[0].type
    const series = parsedSpec.series;
    if (Array.isArray(series) && series.length > 0) {
      const first = series[0] as Record<string, unknown> | undefined;
      if (first && typeof first.type === "string") return first.type;
    }
    return "";
  }, [parsedSpec]);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Close with animation
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        handleClose();
      }
    },
    [handleClose]
  );

  // Apply changes
  const handleApply = useCallback(() => {
    if (parsedSpec) {
      onApply(parsedSpec);
      handleClose();
    }
  }, [parsedSpec, onApply, handleClose]);

  // Reset to original
  const handleReset = useCallback(() => {
    setJsonText(originalSpecJson);
    setParseError(null);
  }, [originalSpecJson]);

  // Quick action: update title
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      try {
        const current = JSON.parse(jsonText) as Record<string, unknown>;
        // ECharts title object
        const existing = current.title;
        current.title = {
          ...(existing && typeof existing === "object" && !Array.isArray(existing)
            ? (existing as Record<string, unknown>)
            : {}),
          text: newTitle,
        };
        setJsonText(JSON.stringify(current, null, 2));
      } catch {
        // If JSON is broken, just ignore
      }
    },
    [jsonText]
  );

  // Quick action: change chart type
  const handleTypeChange = useCallback(
    (newType: string) => {
      try {
        const current = JSON.parse(jsonText) as Record<string, unknown>;
        // ECharts: update all series types
        const series = current.series;
        if (Array.isArray(series)) {
          current.series = series.map((s) => {
            if (s && typeof s === "object") {
              return { ...(s as Record<string, unknown>), type: newType };
            }
            return s;
          });
        }
        setJsonText(JSON.stringify(current, null, 2));
      } catch {
        // If JSON is broken, just ignore
      }
    },
    [jsonText]
  );

  const typeOptions = ECHARTS_TYPE_OPTIONS;

  // Render the drawer content
  const drawer = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={
        "fixed inset-0 z-[9999] flex justify-end " +
        "transition-colors duration-200 " +
        (isVisible ? "bg-black/40" : "bg-transparent")
      }
    >
      {/* Drawer panel */}
      <div
        className={
          "flex flex-col h-full w-full max-w-4xl " +
          "bg-white dark:bg-neutral-900 shadow-2xl " +
          "transition-transform duration-200 ease-out " +
          (isVisible ? "translate-x-0" : "translate-x-full")
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Chart Editor
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              (ECharts)
            </span>
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="Close (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body: split pane */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Quick Actions + Editor */}
          <div className="flex flex-col w-1/2 border-r border-gray-200 dark:border-neutral-700">
            {/* Quick Actions */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800 space-y-2">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Quick Actions
              </div>
              {/* Title */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-300 w-10 shrink-0">
                  Title
                </label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Chart title..."
                  className={
                    "flex-1 px-2 py-1 text-xs rounded border " +
                    "border-gray-200 dark:border-neutral-600 " +
                    "bg-white dark:bg-neutral-800 " +
                    "text-gray-900 dark:text-gray-100 " +
                    "focus:outline-none focus:ring-1 focus:ring-blue-500"
                  }
                />
              </div>
              {/* Chart Type */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-300 w-10 shrink-0">
                  Type
                </label>
                <div className="flex gap-1 flex-wrap">
                  {typeOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={
                        "px-2 py-0.5 text-[11px] rounded border transition-colors " +
                        (currentChartType === t
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-700")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* CodeMirror Editor */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <CodeMirrorEditor
                value={jsonText}
                onChange={setJsonText}
                isDark={isDark}
              />
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="flex flex-col w-1/2">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Live Preview
              </div>
            </div>
            <div className="flex-1 min-h-0 p-3 overflow-auto">
              {parseError ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" className="text-red-400" />
                    <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-red-400" />
                  </svg>
                  <div className="text-xs text-red-600 dark:text-red-400 break-all">
                    {parseError}
                  </div>
                </div>
              ) : parsedSpec ? (
                <div className="w-full h-full min-h-[300px]">
                  <EChartsPreview spec={parsedSpec} />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleApply}
            disabled={parsedSpec === null}
            className={
              "px-4 py-1.5 text-xs font-medium rounded " +
              "bg-blue-500 text-white hover:bg-blue-600 " +
              "disabled:opacity-40 disabled:cursor-not-allowed " +
              "transition-colors"
            }
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleReset}
            className={
              "px-4 py-1.5 text-xs font-medium rounded " +
              "bg-gray-100 dark:bg-neutral-800 " +
              "text-gray-700 dark:text-gray-200 " +
              "hover:bg-gray-200 dark:hover:bg-neutral-700 " +
              "transition-colors"
            }
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

export default ChartEditor;
