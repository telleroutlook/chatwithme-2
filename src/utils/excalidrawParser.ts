/**
 * Excalidraw JSON Parser
 *
 * Parses Excalidraw JSON from ```excalidraw code blocks.
 * Tolerant of minor issues (trailing commas, JS-style comments)
 * but validates that the required `elements` array is present.
 */

const VALID_ELEMENT_TYPES = new Set([
  "rectangle", "ellipse", "diamond", "triangle",
  "arrow", "line", "freedraw",
  "text", "image", "frame", "magicframe", "embeddable",
  "iframe", "selection",
]);

export type ExcalidrawData = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type ExcalidrawParseResult =
  | { ok: true; data: ExcalidrawData; warnings?: string[] }
  | { ok: false; error: string };

/**
 * Parse an Excalidraw JSON string into a validated ExcalidrawData object.
 *
 * Handles:
 * - Standard JSON
 * - Trailing commas (removed before parsing)
 * - Single-line // comments and multi-line comments
 * - Bare elements array (auto-wrapped)
 */
export function parseExcalidrawData(raw: string): ExcalidrawParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty Excalidraw spec" };
  }

  // Strip JS-style comments (// ... and /* ... */)
  let cleaned = trimmed
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // If it starts with [ instead of {, wrap it as { elements: [...] }
  if (cleaned.startsWith("[")) {
    cleaned = `{"elements":${cleaned}}`;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown parse error";
    return { ok: false, error: `Invalid JSON: ${msg}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Excalidraw spec must be a JSON object with an 'elements' array" };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.elements)) {
    return { ok: false, error: "Missing or invalid 'elements' array in Excalidraw spec" };
  }

  // Validate and normalize elements
  const warnings: string[] = [];
  const validElements: unknown[] = [];
  for (const el of obj.elements) {
    if (!el || typeof el !== "object" || Array.isArray(el)) {
      warnings.push("Skipped non-object element");
      continue;
    }
    const elem = el as Record<string, unknown>;

    // Check type field
    if (typeof elem.type !== "string") {
      warnings.push("Skipped element without type field");
      continue;
    }

    if (!VALID_ELEMENT_TYPES.has(elem.type)) {
      warnings.push(`Unknown element type "${elem.type}", keeping as-is`);
    }

    // Ensure required positioning fields have defaults
    if (typeof elem.x !== "number") elem.x = 0;
    if (typeof elem.y !== "number") elem.y = 0;
    if (elem.type !== "text" && elem.type !== "freedraw") {
      if (typeof elem.width !== "number") elem.width = 100;
      if (typeof elem.height !== "number") elem.height = 100;
    }

    validElements.push(elem);
  }

  if (validElements.length === 0 && obj.elements.length > 0) {
    warnings.push("All elements were invalid and filtered out");
  }

  return {
    ok: true,
    data: {
      elements: validElements,
      appState: typeof obj.appState === "object" && obj.appState !== null
        ? (obj.appState as Record<string, unknown>)
        : undefined,
      files: typeof obj.files === "object" && obj.files !== null
        ? (obj.files as Record<string, unknown>)
        : undefined,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
