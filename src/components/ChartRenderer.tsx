import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ChartBar, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowCounterClockwise } from "@phosphor-icons/react";
import { sanitizeMermaidCode, validateMermaidCode } from "../utils/mermaidValidator";
import { trackChatEvent } from "../features/chat/services/trackChatEvent";
import { useChatSessionContext } from "../features/chat/context/ChatSessionContext";
import { useThemeDetector } from "../hooks/useThemeDetector";
import { useInViewport } from "../hooks/useInViewport";
import { getChartVisualPreset } from "./chartVisualPreset";
import { ChartToolbar } from "./ChartToolbar";

// ============ Zoom/Pan Constants ============

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_FACTOR_IN = 1.1;
const WHEEL_ZOOM_FACTOR_OUT = 0.9;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

// ============ Mermaid Node Hover CSS ============

const MERMAID_HOVER_STYLES = `
.mermaid-interactive .node,
.mermaid-interactive .cluster {
  transition: filter 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}
.mermaid-interactive .node:hover {
  filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.35));
  transform: scale(1.03);
}
.mermaid-interactive .cluster:hover {
  filter: drop-shadow(0 2px 6px rgba(99, 102, 241, 0.25));
}
`;

// ============ Mermaid SVG Entrance Animations ============

/**
 * Post-render: add CSS animation classes to Mermaid SVG nodes and edges.
 * This enables staggered fade-in on nodes and stroke draw-in on edges
 * when the chart enters the viewport.
 */
function applyMermaidAnimations(container: HTMLElement, animate: boolean): void {
  if (animate) {
    container.classList.add("animate-nodes", "animate-edges");
  } else {
    container.classList.remove("animate-nodes", "animate-edges");
  }
}

// ============ Mermaid Renderer ============

interface MermaidRendererProps {
  code: string;
  animated?: boolean;
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isDark = useThemeDetector();
  const visualPreset = useMemo(() => getChartVisualPreset(isDark), [isDark]);
  const { currentSessionId } = useChatSessionContext();
  const sanitizedCode = useMemo(() => sanitizeMermaidCode(code), [code]);
  const { ref: inViewRef, inViewport } = useInViewport({ threshold: 0.1 });

  // ---- Zoom / Pan state ----
  const [transform, setTransform] = useState<Transform>(IDENTITY_TRANSFORM);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const transformAtPanStartRef = useRef<Transform>(IDENTITY_TRANSFORM);
  // Touch pinch state
  const lastPinchDistRef = useRef<number | null>(null);

  // Pre-render validation
  const validationError = useMemo(() => {
    const result = validateMermaidCode(sanitizedCode.sanitized);
    if (!result.valid) {
      return result.error || "Invalid Mermaid code";
    }
    return null;
  }, [sanitizedCode.sanitized]);

  useEffect(() => {
    // Skip rendering if pre-validation failed
    if (validationError) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const renderMermaid = async () => {
      if (mounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const mermaid = (await import("mermaid")).default;

        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: visualPreset.mermaidThemeVariables,
          securityLevel: "strict",
          fontFamily: visualPreset.fontFamily,
          flowchart: {
            htmlLabels: false,
            curve: "basis",
          },
        });

        const renderId = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(renderId, sanitizedCode.sanitized.trim());

        if (mounted && containerRef.current) {
          // Mermaid's securityLevel: "strict" sanitizes SVG output
          containerRef.current.textContent = "";
          containerRef.current.innerHTML = svg;

          trackChatEvent("chart_render_success", {
            engine: "mermaid",
            sessionId: currentSessionId
          });

          // Apply SVG entrance animation classes if already in viewport
          applyMermaidAnimations(containerRef.current, inViewport);

          // Reset transform on new render
          setTransform(IDENTITY_TRANSFORM);
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to render diagram";
          setError(errorMessage);
          trackChatEvent("chart_render_failure", {
            engine: "mermaid",
            errorCode: errorMessage,
            sessionId: currentSessionId
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    renderMermaid();

    return () => {
      mounted = false;
    };
  }, [validationError, sanitizedCode.sanitized, currentSessionId, visualPreset]);

  // Apply Mermaid SVG animations when the container enters the viewport
  // (handles the case where render completes before the element scrolls into view)
  useEffect(() => {
    if (inViewport && containerRef.current && !isLoading) {
      applyMermaidAnimations(containerRef.current, true);
    }
  }, [inViewport, isLoading]);

  // ---- Wheel zoom (centered on cursor) ----
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? WHEEL_ZOOM_FACTOR_OUT : WHEEL_ZOOM_FACTOR_IN;

    setTransform((prev) => {
      const newScale = clampScale(prev.scale * factor);
      if (newScale === prev.scale) return prev;

      // Zoom toward cursor position within the viewport
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { ...prev, scale: newScale };

      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Adjust translation so the point under the cursor stays fixed
      const ratio = newScale / prev.scale;
      const newX = cursorX - ratio * (cursorX - prev.x);
      const newY = cursorY - ratio * (cursorY - prev.y);

      return { scale: newScale, x: newX, y: newY };
    });
  }, []);

  // ---- Mouse drag pan ----
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only left button
    if (e.button !== 0) return;
    e.preventDefault();
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    transformAtPanStartRef.current = transform;
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setTransform({
      ...transformAtPanStartRef.current,
      x: transformAtPanStartRef.current.x + dx,
      y: transformAtPanStartRef.current.y + dy,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ---- Double-click to reset ----
  const handleDoubleClick = useCallback(() => {
    setTransform(IDENTITY_TRANSFORM);
  }, []);

  // ---- Touch: pinch-to-zoom and two-finger pan ----
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastPinchDistRef.current = Math.hypot(dx, dy);
      // Capture starting transform for panning
      panStartRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      transformAtPanStartRef.current = transform;
    } else if (e.touches.length === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      transformAtPanStartRef.current = transform;
    }
  }, [transform]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const panDx = midX - panStartRef.current.x;
      const panDy = midY - panStartRef.current.y;

      if (lastPinchDistRef.current !== null) {
        const scaleFactor = dist / lastPinchDistRef.current;
        setTransform((prev) => {
          const newScale = clampScale(prev.scale * scaleFactor);
          return {
            scale: newScale,
            x: transformAtPanStartRef.current.x + panDx,
            y: transformAtPanStartRef.current.y + panDy,
          };
        });
      }
      lastPinchDistRef.current = dist;
    } else if (e.touches.length === 1 && isPanningRef.current) {
      const panDx = e.touches[0].clientX - panStartRef.current.x;
      const panDy = e.touches[0].clientY - panStartRef.current.y;
      setTransform({
        ...transformAtPanStartRef.current,
        x: transformAtPanStartRef.current.x + panDx,
        y: transformAtPanStartRef.current.y + panDy,
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    lastPinchDistRef.current = null;
  }, []);

  // ---- Zoom controls ----
  const zoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: clampScale(prev.scale + ZOOM_STEP),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: clampScale(prev.scale - ZOOM_STEP),
    }));
  }, []);

  const resetZoom = useCallback(() => {
    setTransform(IDENTITY_TRANSFORM);
  }, []);

  // Pre-validation error display
  if (validationError) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">Mermaid Validation Error: {validationError}</span>
        </span>
        <details className="mt-2">
          <summary className="text-xs text-foreground-muted cursor-pointer">View code</summary>
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {code}
          </pre>
        </details>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
        <span className="text-xs">
          <span className="app-text-danger">Mermaid Error: {error}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      ref={inViewRef}
      className="w-full p-4 rounded-xl ring ring-border bg-surface-elevated group relative"
    >
      {/* Inject hover styles */}
      <style>{MERMAID_HOVER_STYLES}</style>

      <div className="flex items-center gap-2 mb-2">
        <ChartBar size={14} className="text-accent" />
        <span className="text-xs text-foreground-muted font-semibold">
          Mermaid Diagram
        </span>
      </div>
      <ChartToolbar containerRef={containerRef} engine="mermaid" isDark={isDark} chartType="diagram" />

      {/* Zoom controls */}
      <div className="absolute top-12 right-6 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={zoomIn}
          className="w-7 h-7 flex items-center justify-center rounded bg-surface-elevated ring ring-border text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <MagnifyingGlassPlus size={14} weight="bold" />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="w-7 h-7 flex items-center justify-center rounded bg-surface-elevated ring ring-border text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <MagnifyingGlassMinus size={14} weight="bold" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="w-7 h-7 flex items-center justify-center rounded bg-surface-elevated ring ring-border text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
          title="Reset zoom"
          aria-label="Reset zoom"
        >
          <ArrowCounterClockwise size={14} weight="bold" />
        </button>
      </div>

      {/* Zoomable / pannable viewport */}
      <div
        ref={viewportRef}
        className="relative overflow-hidden"
        style={{
          minHeight: 100,
          cursor: isPanningRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            transition: isPanningRef.current ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div
            ref={containerRef}
            className={`mermaid-container mermaid-interactive ${inViewport ? "chart-animate-in" : ""}`}
            style={{
              opacity: inViewport ? undefined : 0,
              transform: inViewport ? undefined : "translateY(12px)",
            }}
          />
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85">
            <span className="text-sm text-foreground-muted">Rendering...</span>
          </div>
        )}
      </div>
    </div>
  );
}
