import { memo, useMemo, useState } from "react";
import { CopyIcon, CheckIcon, CaretDownIcon } from "@phosphor-icons/react";

interface JsonTreeViewProps {
  code: string;
  label?: string;
  initialExpanded?: boolean;
  maxDepth?: number;
}

interface JsonNodeProps {
  data: unknown;
  depth: number;
  maxDepth: number;
  expanded: boolean;
  onToggle: () => void;
}

const JsonNode = memo(function JsonNode({ data, depth, maxDepth, expanded, onToggle }: JsonNodeProps) {
  const indent = depth * 16;

  if (data === null) {
    return <span className="text-purple-500">null</span>;
  }

  if (typeof data === "boolean") {
    return <span className="text-amber-500">{data.toString()}</span>;
  }

  if (typeof data === "number") {
    return <span className="text-blue-500">{data}</span>;
  }

  if (typeof data === "string") {
    return <span className="text-green-500">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-foreground-muted">[]</span>;
    }

    if (depth >= maxDepth || !expanded) {
      return (
        <span className="text-foreground-muted">
          [
          <button
            type="button"
            onClick={onToggle}
            className="text-accent hover:underline cursor-pointer"
          >
            {data.length} items
          </button>
          ]
        </span>
      );
    }

    return (
      <span>
        <button type="button" onClick={onToggle} className="inline-flex items-center">
          <CaretDownIcon size={12} className="text-foreground-muted mr-1" />
          <span className="text-foreground-muted">[</span>
        </button>
        <div style={{ marginLeft: indent + 16 }}>
          {data.map((item, index) => (
            <div key={index} className="flex">
              <span className="text-foreground-muted mr-2">{index}:</span>
              <JsonNode
                data={item}
                depth={depth + 1}
                maxDepth={maxDepth}
                expanded={false}
                onToggle={() => {}}
              />
              {index < data.length - 1 && <span className="text-foreground-muted">,</span>}
            </div>
          ))}
        </div>
        <span className="text-foreground-muted" style={{ marginLeft: indent }}>
          ]
        </span>
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <span className="text-foreground-muted">{}</span>;
    }

    if (depth >= maxDepth || !expanded) {
      return (
        <span className="text-foreground-muted">
          {"{"}
          <button
            type="button"
            onClick={onToggle}
            className="text-accent hover:underline cursor-pointer"
          >
            {entries.length} keys
          </button>
          {"}"}
        </span>
      );
    }

    return (
      <span>
        <button type="button" onClick={onToggle} className="inline-flex items-center">
          <CaretDownIcon size={12} className="text-foreground-muted mr-1" />
          <span className="text-foreground-muted">{"{"}</span>
        </button>
        <div style={{ marginLeft: indent + 16 }}>
          {entries.map(([key, value], index) => (
            <div key={key} className="flex flex-wrap">
              <span className="text-cyan-500 mr-2">"{key}":</span>
              <JsonNode
                data={value}
                depth={depth + 1}
                maxDepth={maxDepth}
                expanded={false}
                onToggle={() => {}}
              />
              {index < entries.length - 1 && <span className="text-foreground-muted">,</span>}
            </div>
          ))}
        </div>
        <span className="text-foreground-muted" style={{ marginLeft: indent }}>{"}"}</span>
      </span>
    );
  }

  return <span>{String(data)}</span>;
});

/**
 * JsonTreeView - Renders JSON as an interactive tree view
 *
 * Key features:
 * - Collapsible nodes
 * - Syntax highlighting
 * - Auto height
 */
export const JsonTreeView = memo(function JsonTreeView({
  code,
  label = "JSON",
  initialExpanded = true,
  maxDepth = 10,
}: JsonTreeViewProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);

  // Parse JSON safely
  const parsedData = useMemo(() => {
    try {
      return JSON.parse(code);
    } catch {
      return null;
    }
  }, [code]);

  const parseError = useMemo(() => {
    if (parsedData === null && code.trim()) {
      try {
        JSON.parse(code);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Invalid JSON";
      }
    }
    return null;
  }, [code, parsedData]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="my-3 w-full not-prose rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="px-3 py-2 text-xs text-foreground-muted bg-muted/50 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono">{label}</span>
          {parsedData !== null && (
            <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 text-[10px]">
              Valid
            </span>
          )}
          {parseError && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 text-[10px]">
              Error
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground-muted border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[600px] overflow-auto p-4 font-mono text-sm bg-surface">
        {parseError ? (
          <div className="text-red-500">
            <div className="font-bold">Parse Error:</div>
            <div>{parseError}</div>
            <pre className="mt-2 text-xs text-foreground-muted whitespace-pre-wrap">{code}</pre>
          </div>
        ) : (
          <JsonNode
            data={parsedData}
            depth={0}
            maxDepth={maxDepth}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        )}
      </div>
    </div>
  );
});

/**
 * Check if content is valid JSON
 */
export function isValidJson(code: string): boolean {
  try {
    JSON.parse(code);
    return true;
  } catch {
    return false;
  }
}
