/**
 * Lightweight Mermaid Validator
 *
 * Pre-render validation to catch common errors before mermaid.render().
 * This helps reduce runtime errors and provides better error messages.
 */

/** Validation error types */
export type MermaidErrorType = "declaration" | "brackets" | "html" | "empty";

/** Validation result */
export interface MermaidValidationResult {
  valid: boolean;
  error?: string;
  errorType?: MermaidErrorType;
}

/** Valid Mermaid diagram type declarations */
const VALID_DIAGRAM_TYPES = new Set([
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram-v2",
  "stateDiagram",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "gitGraph",
  "quadrantChart",
  "requirementDiagram",
  "kanban",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "architecture-beta",
  "packet-beta",
  "c4context",
  "C4Context",
]);

/**
 * Validate diagram type declaration
 */
export function validateDeclaration(code: string): MermaidValidationResult {
  const trimmed = code.trim();

  if (!trimmed) {
    return { valid: false, error: "Empty diagram", errorType: "empty" };
  }

  const firstLine = trimmed.split("\n")[0].trim();

  // Extract first word as diagram type
  const match = firstLine.match(/^(\S+)/);
  if (!match) {
    return { valid: false, error: "Missing diagram type declaration", errorType: "declaration" };
  }

  const diagramType = match[1];

  // Check if it's a valid diagram type
  let isValid = VALID_DIAGRAM_TYPES.has(diagramType);

  // Handle graph/flowchart with direction suffix (e.g., graph TD, flowchart LR)
  if (!isValid && (diagramType.startsWith("graph") || diagramType.startsWith("flowchart"))) {
    // Allow graph/flowchart with direction suffix
    isValid = /^(graph|flowchart)[A-Za-z]*$/.test(diagramType);
  }

  if (!isValid) {
    return {
      valid: false,
      error: `Unknown diagram type: ${diagramType}`,
      errorType: "declaration",
    };
  }

  return { valid: true };
}

/**
 * Validate bracket balance
 */
export function validateBrackets(code: string): MermaidValidationResult {
  const stack: string[] = [];
  const pairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
  };

  let inString = false;
  let stringChar = "";

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : "";

    // Handle string boundaries
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    // Skip content inside strings
    if (inString) continue;

    // Check brackets
    if (pairs[char]) {
      stack.push(char);
    } else if (Object.values(pairs).includes(char)) {
      const last = stack.pop();
      if (!last || pairs[last] !== char) {
        return {
          valid: false,
          error: `Unmatched closing bracket: ${char}`,
          errorType: "brackets",
        };
      }
    }
  }

  if (stack.length > 0) {
    return {
      valid: false,
      error: `Unclosed bracket: ${stack[stack.length - 1]}`,
      errorType: "brackets",
    };
  }

  return { valid: true };
}

/**
 * Validate no HTML tags
 */
export function validateNoHtml(code: string): MermaidValidationResult {
  // Detect HTML tag patterns
  const htmlPattern = /<\/?[a-zA-Z][a-zA-Z0-9]*(\s+[^>]*)?\/?>/g;
  const matches = code.match(htmlPattern);

  if (matches && matches.length > 0) {
    return {
      valid: false,
      error: `HTML tags not supported: ${matches[0]}`,
      errorType: "html",
    };
  }

  return { valid: true };
}

/**
 * Comprehensive Mermaid code validation
 *
 * Performs:
 * 1. Empty check
 * 2. Declaration line validation
 * 3. HTML tag detection
 * 4. Bracket balance (optional, can have false positives for complex syntax)
 */
export function validateMermaidCode(code: string): MermaidValidationResult {
  // 1. Empty check
  if (!code || !code.trim()) {
    return { valid: false, error: "Empty diagram", errorType: "empty" };
  }

  // 2. Declaration line validation
  const declResult = validateDeclaration(code);
  if (!declResult.valid) return declResult;

  // 3. HTML tag check
  const htmlResult = validateNoHtml(code);
  if (!htmlResult.valid) return htmlResult;

  // Note: Bracket validation is skipped by default as it can have false positives
  // with Mermaid's complex syntax (subgraphs, class definitions, etc.)
  // Uncomment below if strict bracket checking is needed:
  // const bracketResult = validateBrackets(code);
  // if (!bracketResult.valid) return bracketResult;

  return { valid: true };
}
