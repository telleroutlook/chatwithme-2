# Developer Pitfalls & Lessons Learned

Common mistakes and their solutions, distilled from production incidents.

---

## 1. AI SDK `tool()` — use `inputSchema`, NOT `parameters`

**Severity**: Critical — tools silently receive empty `{}` args

In AI SDK v6 (`ai@^6.0.0`), the `tool()` helper is a **pass-through** — it does NOT rename fields. Internally, `prepareToolsAndToolChoice()` reads `tool.inputSchema` to build the JSON schema sent to the model API. If you use `parameters` instead, the schema sent to the API is `{ properties: {}, additionalProperties: false }` — the model sees no parameters and returns `{}`.

```ts
// ❌ WRONG — results in empty tool arguments
import { tool } from "ai";
import { z } from "zod";

tool({
  description: "Search the web",
  parameters: z.object({         // <-- 'parameters' is IGNORED by AI SDK v6
    query: z.string()
  }),
  execute: async (args) => { ... }
});

// ✅ CORRECT — always use inputSchema
tool({
  description: "Search the web",
  inputSchema: z.object({        // <-- 'inputSchema' is what AI SDK reads
    query: z.string()
  }),
  execute: async (args) => { ... }
});
```

**How this manifests**: The model calls the tool, but `execute` receives `{}`. The tool returns an error or empty result. The model retries until `maxToolSteps` is exhausted. Final response is empty or garbled.

**Detection**: If you see tools being called but producing errors about missing parameters, check that all tools use `inputSchema`.

---

## 2. `streamText` returns empty `result.text` when all steps are tool-calls

**Severity**: High — triggers incorrect retry logic

When using `streamText` with tools, if the model exhausts all `maxToolSteps` and every step finishes with `finish_reason: "tool-calls"` (never `"stop"`), then `result.text` is `""` even though text was streamed to the client via `onChunk`.

```
Step 0: finishReason=tool-calls, text="我来帮您搜索..." (streamed to UI)
Step 1: finishReason=tool-calls, text=""  (more tool calls)
Step 2: finishReason=tool-calls, text=""  (more tool calls)
Step 3: finishReason=tool-calls, text=""  (more tool calls)
→ result.text = ""  ← EMPTY, even though "我来帮您搜索..." was already shown to user
```

**Impact**: If your code checks `result.text.trim().length === 0` to trigger a retry, the retry fires even though text was already displayed, causing **duplicated/concatenated output**.

**Mitigation**: Track `streamedLength` independently via the `onChunk`/`onTextDelta` callback. When retrying after text was already streamed, add a visual separator (`\n\n`) before the retry output.

---

## 3. Retry path must strip tool descriptions from system prompt

**Severity**: High — model outputs raw JSON tool calls as text

When retrying with `tools: {}` (no tools), the system prompt must NOT contain tool descriptions. If the model sees tool names (e.g., "builtin_web_search: Search the web...") but has no `tool_calls` mechanism available, it will output raw JSON describing tool calls as text:

```
首先进行搜索：

```json
[{"name": "builtin_web_search", "arguments": "{\"query\": \"...\"}"}]
```​
```

**Fix**: Before the retry, call `stripToolSections(systemPrompt)` to remove the `## Web Tools` section and `builtin_*` references. Also add explicit instruction: "Do not output JSON describing tool calls."

**Architecture rule**: Any code path that calls the model with `tools: {}` must ensure the system prompt does not mention specific tool names.

---

## 4. GLM API `tool_stream` and `thinking` are provider-specific fields

**Severity**: Low — works correctly but is non-obvious

The `@ai-sdk/openai-compatible` provider passes `providerOptions.<providerName>` fields as top-level body fields to the API. For GLM:

```ts
providerOptions: {
  glm: {                        // ← matches provider name from createOpenAICompatible({ name: "glm" })
    thinking: { type: "disabled" },
    tool_stream: true
  }
}
```

These become top-level fields in the HTTP request body:
```json
{ "model": "GLM-4.7", "thinking": {"type": "disabled"}, "tool_stream": true, ... }
```

**Key**: The provider name in `providerOptions` must match the `name` parameter in `createOpenAICompatible()`. Using the wrong key (e.g., `openaiCompatible` or `openai`) silently drops the options.

---

## 5. DuckDuckGo search returns empty from Cloudflare Workers

**Severity**: Medium — search tool returns no results

DuckDuckGo's HTML endpoint (`html.duckduckgo.com/html/`) frequently returns HTTP 202 (bot detection) when called from Cloudflare Workers IP ranges. This causes `builtin_web_search` to return "No search results found."

**Impact**: The model may retry searching multiple times with different queries, exhausting `maxToolSteps` without ever getting useful results. It then falls back to answering from its own knowledge.

**Mitigations**:
- The search tool returns a helpful error message that tells the model to try rephrasing or answer from knowledge
- The `retryEmptyResponse` path handles the case where all tool steps were exhausted
- Consider adding a fallback search provider (e.g., MCP web-search-prime) that uses a different endpoint

---

## 6. `npm install` requires `--legacy-peer-deps`

**Severity**: Low — install fails without the flag

Due to `zod` v3 vs v4 conflict between packages, `npm install` must always use `--legacy-peer-deps`. The AI SDK internally uses `zod/v4` while the project and `@hono/zod-validator` use zod v3 compatibility mode.

---

## 7. Always use `npm run deploy`, never raw `wrangler deploy`

**Severity**: Critical — deploys stale code

`npm run deploy` runs: `typecheck → vite build → wrangler deploy → verify-deploy`. Skipping the `vite build` step causes the previously built worker code to be deployed, which may be hours or days old.

---

## Quick Reference: Tool Call Debugging Checklist

When tool calls are not working in production:

1. **Check tool definition**: Does it use `inputSchema` (not `parameters`)?
2. **Check API request body**: Are `tools` non-empty with correct JSON schemas?
3. **Check API response**: Does it contain `tool_calls` with populated `arguments`?
4. **Check tool execution**: Does `execute` receive the correct `args`?
5. **Check step count**: Is `maxToolSteps` sufficient? Are all steps `tool-calls` with no `stop`?
6. **Check retry path**: Does `retryEmptyResponse` strip tool sections from system prompt?
7. **Check search results**: Is DuckDuckGo returning 202 / empty from Workers?
