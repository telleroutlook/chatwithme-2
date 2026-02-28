import { useEffect, useRef, useState } from "react";
import { Text, Surface, Badge } from "@cloudflare/kumo";
import { ChartBarIcon } from "@phosphor-icons/react";

// ============ Mermaid Renderer ============

interface MermaidRendererProps {
  code: string;
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const renderMermaid = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        });

        const renderId = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(renderId, code.trim());

        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = "";
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
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
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [code]);

  if (error) {
    return (
      <Surface className="p-3 rounded-lg ring ring-red-300 bg-red-50">
        <Text size="xs">
          <span className="text-red-600">Mermaid Error: {error}</span>
        </Text>
      </Surface>
    );
  }

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line bg-white">
      <div className="flex items-center gap-2 mb-2">
        <ChartBarIcon size={14} className="text-kumo-accent" />
        <Text size="xs" variant="secondary" bold>
          Mermaid Diagram
        </Text>
      </div>
      {isLoading ? (
        <div className="text-center py-4 text-kumo-subtle">Rendering...</div>
      ) : (
        <div ref={containerRef} className="mermaid-container overflow-x-auto" />
      )}
    </Surface>
  );
}

// ============ G2 Chart Renderer ============

interface G2ChartRendererProps {
  spec: {
    type?: string;
    data: Record<string, unknown>[];
    encode?: Record<string, string>;
    [key: string]: unknown;
  };
}

interface G2ChartInstance {
  mark: (type: "interval" | "line" | "point" | "area" | "cell" | "rect") => void;
  data: (data: Record<string, unknown>[]) => void;
  encode: (encode: Record<string, string | number>) => void;
  axis: (axis: Record<string, unknown>) => void;
  legend: (legend: Record<string, unknown>) => void;
  scale: (scale: Record<string, unknown>) => void;
  style: (style: Record<string, unknown>) => void;
  render: () => Promise<void>;
  destroy: () => void;
}

export function G2ChartRenderer({ spec }: G2ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let chart: G2ChartInstance | null = null;

    const renderChart = async () => {
      try {
        if (!containerRef.current) return;

        const { Chart } = await import("@antv/g2");

        chart = new Chart({
          container: containerRef.current,
          autoFit: true,
          height: 300,
        }) as unknown as G2ChartInstance;

        if (spec.type) {
          chart.mark(spec.type as "interval" | "line" | "point" | "area" | "cell" | "rect");
        }

        if (spec.data) {
          chart.data(spec.data);
        }

        if (spec.encode) {
          chart.encode(spec.encode as Record<string, string | number>);
        }

        if (spec.axis) chart.axis(spec.axis as Record<string, unknown>);
        if (spec.legend) chart.legend(spec.legend as Record<string, unknown>);
        if (spec.scale) chart.scale(spec.scale as Record<string, unknown>);
        if (spec.style) chart.style(spec.style as Record<string, unknown>);

        await chart.render();

        if (mounted) {
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to render chart");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      mounted = false;
      if (chart) {
        chart.destroy();
      }
    };
  }, [spec]);

  if (error) {
    return (
      <Surface className="p-3 rounded-lg ring ring-red-300 bg-red-50">
        <Text size="xs">
          <span className="text-red-600">G2 Chart Error: {error}</span>
        </Text>
      </Surface>
    );
  }

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line bg-white">
      <div className="flex items-center gap-2 mb-2">
        <ChartBarIcon size={14} className="text-kumo-accent" />
        <Text size="xs" variant="secondary" bold>
          G2 Chart
        </Text>
        {spec.type && <Badge variant="secondary">{spec.type}</Badge>}
      </div>
      <div className="relative">
        <div ref={containerRef} className="g2-chart-container" style={{ minHeight: 300 }} />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <span className="text-sm text-kumo-subtle">Rendering chart...</span>
          </div>
        )}
      </div>
    </Surface>
  );
}

// ============ Chart Config Detector ============

interface ChartContent {
  type: "mermaid" | "g2";
  content: string | Record<string, unknown>;
}

export function parseChartFromText(text: string): ChartContent | null {
  const mermaidMatch = text.match(/```mermaid\s*([\s\S]*?)```/);
  if (mermaidMatch) {
    return {
      type: "mermaid",
      content: mermaidMatch[1].trim(),
    };
  }

  const g2Match = text.match(/```g2\s*([\s\S]*?)```/);
  if (g2Match) {
    try {
      const spec = JSON.parse(g2Match[1].trim());
      return {
        type: "g2",
        content: spec,
      };
    } catch {
      // Invalid JSON, ignore
    }
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.chartType === "g2" || (parsed.type && parsed.data)) {
        return {
          type: "g2",
          content: parsed,
        };
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

// ============ Combined Chart Renderer ============

interface ChartDisplayProps {
  text: string;
}

export function ChartDisplay({ text }: ChartDisplayProps) {
  const charts = extractAllCharts(text);

  if (charts.length === 0) return null;

  return (
    <div className="space-y-3 mt-2">
      {charts.map((chart, index) => (
        <div key={index}>
          {chart.type === "mermaid" ? (
            <MermaidRenderer code={chart.content as string} />
          ) : (
            <G2ChartRenderer spec={chart.content as G2ChartRendererProps["spec"]} />
          )}
        </div>
      ))}
    </div>
  );
}

function extractAllCharts(text: string): ChartContent[] {
  const charts: ChartContent[] = [];

  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = mermaidRegex.exec(text)) !== null) {
    charts.push({
      type: "mermaid",
      content: match[1].trim(),
    });
  }

  const g2Regex = /```g2\s*([\s\S]*?)```/g;
  while ((match = g2Regex.exec(text)) !== null) {
    try {
      const spec = JSON.parse(match[1].trim());
      charts.push({
        type: "g2",
        content: spec,
      });
    } catch {
      // Invalid JSON, skip
    }
  }

  return charts;
}
