/**
 * Excalidraw JSON Parser
 *
 * Parses Excalidraw JSON from ```excalidraw code blocks.
 * Tolerant of minor issues (trailing commas, JS-style comments)
 * but validates that the required `elements` array is present.
 */

export type ExcalidrawData = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type ExcalidrawParseResult =
  | { ok: true; data: ExcalidrawData }
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

  return {
    ok: true,
    data: {
      elements: obj.elements,
      appState: typeof obj.appState === "object" && obj.appState !== null
        ? (obj.appState as Record<string, unknown>)
        : undefined,
      files: typeof obj.files === "object" && obj.files !== null
        ? (obj.files as Record<string, unknown>)
        : undefined,
    },
  };
}
