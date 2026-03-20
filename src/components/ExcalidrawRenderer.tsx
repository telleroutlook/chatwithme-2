import { useEffect, useRef, useState, memo, useCallback } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { useThemeDetector } from "../hooks/useThemeDetector";
import type { ExcalidrawData } from "../utils/excalidrawParser";

interface ExcalidrawRendererProps {
  data: ExcalidrawData;
}

/**
 * Renders an interactive Excalidraw canvas from parsed Excalidraw JSON data.
 *
 * Lazy-loads both the Excalidraw component and its CSS on first render.
 * Users can drag, edit, and add elements directly in the embedded canvas.
 */
export const ExcalidrawRenderer = memo(function ExcalidrawRenderer({
  data,
}: ExcalidrawRendererProps) {
  const isDark = useThemeDetector();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [convertFn, setConvertFn] = useState<((els: unknown[]) => unknown[]) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load Excalidraw component and CSS dynamically
  useEffect(() => {
    let mounted = true;

    async function loadExcalidraw() {
      try {
        // Import CSS first — Excalidraw requires its styles
        await import("@excalidraw/excalidraw/index.css");

        const mod = await import("@excalidraw/excalidraw");
        if (!mounted) return;

        // Store the component (wrapped in a function to avoid React treating it as a lazy init)
        setExcalidrawComp(() => mod.Excalidraw as unknown as React.ComponentType<Record<string, unknown>>);

        // Store convertToExcalidrawElements if available
        if (typeof mod.convertToExcalidrawElements === "function") {
          setConvertFn(() => mod.convertToExcalidrawElements as (els: unknown[]) => unknown[]);
        }
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load Excalidraw";
        setLoadError(msg);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadExcalidraw();
    return () => { mounted = false; };
  }, []);

  // Convert skeleton elements to full Excalidraw elements if converter is available
  const getInitialData = useCallback(() => {
    let elements = data.elements;
    if (convertFn) {
      try {
        elements = convertFn(data.elements);
      } catch {
        // Fall back to raw elements if conversion fails
      }
    }

    return {
      elements,
      appState: {
        viewBackgroundColor: "transparent",
        ...(data.appState ?? {}),
      },
      files: data.files ?? undefined,
    };
  }, [data, convertFn]);

  if (loadError) {
    return (
      <div className="my-3 rounded-xl ring ring-border overflow-hidden bg-surface-elevated p-4">
        <div className="flex items-center gap-2 mb-2">
          <PencilSimple size={14} className="text-accent" />
          <span className="text-xs text-foreground-muted font-semibold">Excalidraw Sketch</span>
        </div>
        <div className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3 text-xs">
          <span className="app-text-danger">Failed to load Excalidraw: {loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
        <PencilSimple size={14} className="text-accent" />
        <span className="text-xs text-foreground-muted font-semibold">Excalidraw Sketch</span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full"
        style={{ minHeight: 400, height: 500 }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-sm text-foreground-muted">Loading Excalidraw...</span>
            </div>
          </div>
        )}

        {ExcalidrawComp && (
          <ExcalidrawComp
            initialData={getInitialData()}
            isCollaborating={false}
            viewModeEnabled={false}
            theme={isDark ? "dark" : "light"}
            UIOptions={{
              canvasActions: {
                export: { saveFileToDisk: true },
                saveAsImage: true,
              },
            }}
          />
        )}
      </div>
    </div>
  );
});
