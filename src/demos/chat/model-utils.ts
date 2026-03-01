import type { ModelMessage } from "ai";

export interface MessagePartLike {
  type: string;
  text?: string;
}

export interface ChatMessageLike {
  role: string;
  parts: MessagePartLike[];
}

export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (toolName === "webSearchPrime") {
    const queryValue =
      typeof args.search_query === "string"
        ? args.search_query
        : typeof args.query === "string"
          ? args.query
          : "";
    const { query: _query, ...rest } = args;
    return queryValue ? { ...rest, search_query: queryValue } : rest;
  }

  if (toolName === "webReader") {
    const urlValue =
      typeof args.url === "string"
        ? args.url
        : typeof args.link === "string"
          ? args.link
          : "";
    const { link: _link, ...rest } = args;
    return urlValue ? { ...rest, url: urlValue } : rest;
  }

  return args;
}

export function getMessageText(parts: MessagePartLike[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function toFallbackModelMessages(messages: ChatMessageLike[]): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    const contentText = getMessageText(message.parts).trim();
    if (!contentText) continue;
    if (message.role === "system") {
      result.push({
        role: "system",
        content: contentText
      });
      continue;
    }
    if (message.role === "assistant") {
      result.push({
        role: "assistant",
        content: [{ type: "text" as const, text: contentText }]
      });
      continue;
    }
    result.push({
      role: "user",
      content: [{ type: "text" as const, text: contentText }]
    });
  }
  return result;
}
