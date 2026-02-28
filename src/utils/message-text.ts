import type { UIMessage } from "ai";

type TextPart = { type: "text"; text: string };

function needsNewlineBetween(prev: string, next: string): boolean {
  if (!prev || !next) return false;

  if (/[\s\n]$/.test(prev) || /^[\s\n]/.test(next)) {
    return false;
  }

  // Keep fenced code blocks valid when language info and content are streamed in separate chunks.
  if (/```[a-zA-Z0-9_-]+$/.test(prev)) {
    return true;
  }

  // Keep fenced block closing delimiter on its own line when split.
  if (!prev.endsWith("\n") && next.startsWith("```")) {
    return true;
  }

  return false;
}

export function collectMessageTextParts(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];

  return parts
    .filter((part: unknown): part is TextPart => {
      if (!part || typeof part !== "object") return false;
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    })
    .map((part) => part.text);
}

export function joinMessageTextParts(parts: string[]): string {
  if (parts.length === 0) return "";

  return parts.reduce((acc, part) => {
    if (!acc) return part;
    return needsNewlineBetween(acc, part) ? `${acc}\n${part}` : `${acc}${part}`;
  }, "");
}

export function getMessageText(message: UIMessage): string {
  const candidate = message as unknown as {
    content?: unknown;
    parts?: unknown;
  };

  if (typeof candidate.content === "string") {
    return candidate.content;
  }

  return joinMessageTextParts(collectMessageTextParts(candidate.parts));
}
