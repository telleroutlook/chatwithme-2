/**
 * HTML Document Parser
 * Extracts styles, scripts, and body content from full HTML documents
 * for safe rendering with Shadow DOM isolation
 */

export interface ParsedHtmlDocument {
  styles: string[];
  externalStyles: string[];
  bodyContent: string;
  title?: string;
}

/**
 * Sanitize external style URLs to prevent XSS attacks
 * Only allows:
 * - HTTPS URLs
 * - Relative paths (starting with / or ./)
 * Explicitly rejects:
 * - javascript: URLs
 * - data: URLs
 * - Other potentially dangerous protocols
 */
export function sanitizeExternalStyle(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Allow HTTPS URLs
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Allow relative paths
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return trimmed;
  }

  // Block dangerous protocols
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    if (typeof console !== 'undefined') {
      console.warn('Blocked unsafe external style URL:', url);
    }
    return null;
  }

  // Block other protocols (http:, ftp:, etc.) for security
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (typeof console !== 'undefined') {
      console.warn('Blocked non-HTTPS external style URL:', url);
    }
    return null;
  }

  // Allow relative paths without leading ./ (e.g., "styles/main.css")
  return trimmed;
}

/**
 * Parse a complete HTML document and extract its components
 */
export function parseHtmlDocument(html: string): ParsedHtmlDocument {
  if (typeof document === "undefined") {
    return { styles: [], externalStyles: [], bodyContent: html };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Extract all <style> tag contents
  const styles = Array.from(doc.querySelectorAll("style"))
    .map((s) => s.textContent || "")
    .filter(Boolean);

  // Extract and sanitize external stylesheet links
  const externalStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => link.getAttribute("href") || "")
    .filter(Boolean)
    .map((url) => sanitizeExternalStyle(url))
    .filter((url): url is string => url !== null);

  // Extract body content
  const bodyContent = doc.body?.innerHTML || "";

  // Extract title
  const title = doc.querySelector("title")?.textContent || undefined;

  return { styles, externalStyles, bodyContent, title };
}

/**
 * Check if content looks like a complete HTML document
 */
export function looksLikeHtmlDocument(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.includes("<html") ||
    normalized.includes("<head") ||
    normalized.includes("<body")
  );
}

/**
 * Strip empty sourceMappingURL directives from code
 */
export function stripEmptySourceMapDirectives(code: string): string {
  if (!code || !code.includes("sourceMappingURL")) return code;
  return code
    .replace(/^[\t ]*\/\/[#@]\s*sourceMappingURL=.*$/gim, "")
    .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//gi, "")
    .replace(/<!--\s*[#@]?\s*sourceMappingURL=.*?-->/gim, "");
}

/**
 * Dangerous tags that should be removed
 */
const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "form"];

/**
 * Dangerous attributes patterns (event handlers, etc.)
 */
const DANGEROUS_ATTR_PATTERNS = [
  /^on/i, // Event handlers: onclick, onload, etc.
  /^data-/i, // Some data attributes can be exploited
  /^srcdoc$/i, // iframe srcdoc
  /^formaction$/i, // Form action override
];

/**
 * Sanitize HTML content for safe rendering
 * Removes dangerous tags and attributes
 */
export function sanitizeHtmlContent(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove dangerous tags
  for (const tag of DANGEROUS_TAGS) {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  }

  // Remove dangerous attributes from all elements
  const allElements = doc.querySelectorAll("*");
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const isDangerous = DANGEROUS_ATTR_PATTERNS.some((pattern) => pattern.test(attr.name));
      if (isDangerous) {
        el.removeAttribute(attr.name);
      }
      // Remove javascript: URLs
      if (attr.name === "href" || attr.name === "src") {
        const value = attr.value.trim().toLowerCase();
        if (value.startsWith("javascript:") || value.startsWith("data:text/html")) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });

  return doc.body?.innerHTML || "";
}

/**
 * Create a complete HTML document from partial HTML
 */
export function createCompleteHtml(partialHtml: string): string {
  const sanitized = stripEmptySourceMapDirectives(partialHtml);
  if (looksLikeHtmlDocument(sanitized)) {
    return sanitized;
  }
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{margin:0;padding:8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}</style></head><body>${sanitized}</body></html>`;
}

/**
 * Decode HTML entities
 */
export function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}
