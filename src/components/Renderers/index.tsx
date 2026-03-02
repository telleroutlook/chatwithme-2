/**
 * Renderers Registry
 * Central registry for all content renderers
 */

// Core renderers
export { HtmlDirectRenderer } from "./HtmlDirectRenderer";
export {
  SvgRenderer,
  looksLikeSvgMarkup,
  extractFirstSvgMarkup,
} from "./SvgRenderer";
export { JsonTreeView, isValidJson } from "./JsonTreeView";

// Re-export from ChartRenderer
export {
  MermaidRenderer,
  G2ChartRenderer,
} from "../ChartRenderer";

// Re-export G2 spec parser
export { parseG2SpecFromCode } from "../../utils/g2SpecParser";

// Re-export CodeBlock
export { CodeBlock } from "../CodeBlock";

/**
 * Renderer configuration
 */
export interface RendererConfig {
  component: React.ComponentType<{ code: string; [key: string]: unknown }>;
  extensions: string[];
  detect?: (code: string) => boolean;
}

/**
 * Detect the appropriate renderer based on content and language
 */
export function detectRenderer(
  code: string,
  language: string
): {
  type:
    | "html"
    | "svg"
    | "mermaid"
    | "g2"
    | "json"
    | "yaml"
    | "markdown"
    | "code";
  language: string;
} {
  const lang = language.trim().toLowerCase();
  const normalizedCode = code.trim();

  // HTML detection
  if (lang === "html") {
    return { type: "html", language: "html" };
  }

  // SVG detection
  if (lang === "svg" || (lang === "xml" && /<svg\b/i.test(normalizedCode))) {
    return { type: "svg", language: "svg" };
  }

  // Mermaid detection
  if (lang === "mermaid" || lang === "mmd") {
    return { type: "mermaid", language: "mermaid" };
  }

  // G2 detection
  if (lang === "g2" || lang === "g2plot") {
    return { type: "g2", language: "g2" };
  }

  // JSON detection
  if (lang === "json" || lang === "jsonc" || lang === "json5") {
    return { type: "json", language: "json" };
  }

  // YAML detection
  if (lang === "yaml" || lang === "yml") {
    return { type: "yaml", language: "yaml" };
  }

  // Markdown detection
  if (lang === "markdown" || lang === "md") {
    return { type: "markdown", language: "markdown" };
  }

  // Content-based detection
  if (/<svg\b/i.test(normalizedCode)) {
    return { type: "svg", language: "svg" };
  }

  if (
    /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i.test(
      normalizedCode
    )
  ) {
    return { type: "mermaid", language: "mermaid" };
  }

  // Default to code block
  return { type: "code", language: lang || "text" };
}
