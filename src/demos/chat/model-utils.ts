import type { ModelMessage } from "ai";

export interface MessagePartLike {
  type: string;
  text?: string;
}

export interface ChatMessageLike {
  role: string;
  parts: MessagePartLike[];
}

type ToolKind = "webSearch" | "webSearchPrime" | "webReader" | "builtinWebReader" | "unknown";

interface ToolContext {
  alias?: string;
  serverId?: string;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectToolIdentityNames(toolName: string, context?: ToolContext): string[] {
  const names = [toolName, context?.alias, context?.serverId].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return names.map(normalizeName);
}

export function resolveToolKind(toolName: string, context?: ToolContext): ToolKind {
  const names = collectToolIdentityNames(toolName, context);

  // Built-in DuckDuckGo search
  if (
    names.some(
      (name) =>
        name === "builtinwebsearch" ||
        name.includes("builtin_web_search") ||
        name === "builtinwebsearch"
    )
  ) {
    return "webSearch";
  }

  // Built-in Jina web reader
  if (
    names.some(
      (name) =>
        name === "builtinwebreader" ||
        name.includes("builtin_web_reader")
    )
  ) {
    return "builtinWebReader";
  }

  if (
    names.some(
      (name) =>
        name.includes("websearchprime") ||
        (name.includes("websearch") && name.includes("prime"))
    )
  ) {
    return "webSearchPrime";
  }

  if (names.some((name) => name.includes("webreader"))) {
    return "webReader";
  }

  return "unknown";
}

export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolContext
): Record<string, unknown> {
  const toolKind = resolveToolKind(toolName, context);

  if (toolKind === "webSearch" || toolKind === "webSearchPrime") {
    const queryFields = ["search_query", "searchQuery", "query", "q", "keyword", "keywords", "search"];
    let queryValue = "";
    for (const field of queryFields) {
      const value = args[field];
      if (typeof value === "string" && value.trim().length > 0) {
        queryValue = value.trim();
        break;
      }
    }
    const {
      query: _query,
      q: _q,
      keyword: _keyword,
      keywords: _keywords,
      search: _search,
      searchQuery: _searchQueryCamel,
      search_query: _searchQuerySnake,
      ...rest
    } = args;
    return queryValue ? { ...rest, search_query: queryValue } : rest;
  }

  if (toolKind === "webReader" || toolKind === "builtinWebReader") {
    const urlFields = ["url", "link", "uri", "target_url", "targetUrl", "webpage_url", "webpageUrl"];
    let urlValue = "";
    for (const field of urlFields) {
      const value = args[field];
      if (typeof value === "string" && value.trim().length > 0) {
        urlValue = value.trim();
        break;
      }
    }
    const {
      link: _link,
      uri: _uri,
      target_url: _targetUrlSnake,
      targetUrl: _targetUrlCamel,
      webpage_url: _webpageUrlSnake,
      webpageUrl: _webpageUrlCamel,
      ...rest
    } = args;
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
