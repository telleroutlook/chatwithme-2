/**
 * G2 chart spec parser utilities
 * Lightweight parser functions extracted from ChartRenderer for tree-shaking
 */

function sanitizeFunctionLikeProps(input: string): string {
  let output = input;
  const functionLikePropPatterns = [
    // "formatter": (d) => { ... }
    /,\s*"formatter"\s*:\s*\([^)]*\)\s*=>[\s\S]*?(?=(,\s*"(?:[^"\\]|\\.)+"\s*:|\s*[}\]]))/g,
    /"formatter"\s*:\s*\([^)]*\)\s*=>[\s\S]*?(?=(,\s*"(?:[^"\\]|\\.)+"\s*:|\s*[}\]]))/g,
    // "formatter": function (...) { ... }
    /,\s*"formatter"\s*:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\}(?=(,\s*"(?:[^"\\]|\\.)+"\s*:|\s*[}\]]))/g,
    /"formatter"\s*:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\}(?=(,\s*"(?:[^"\\]|\\.)+"\s*:|\s*[}\]]))/g
  ];

  for (const pattern of functionLikePropPatterns) {
    output = output.replace(pattern, "");
  }
  return output;
}

function sanitizeG2JsonLikeText(raw: string): string {
  return sanitizeFunctionLikeProps(raw)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

/**
 * Parse G2 chart specification from code string
 * Supports both strict JSON and permissive JSON-like text
 */
export function parseG2SpecFromCode(code: string): Record<string, unknown> | null {
  const raw = code.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    // Fall through to permissive parsing path.
  }

  try {
    const sanitized = sanitizeG2JsonLikeText(raw);
    const reparsed = JSON.parse(sanitized);
    if (!reparsed || typeof reparsed !== "object") return null;
    return reparsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
