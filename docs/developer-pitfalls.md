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

## 5. `builtin_web_search` backend history — why DDG and BigModel were dropped

**Severity**: High — wrong backend causes the model to falsely claim "I cannot access the internet"

### The full failure chain

When the search backend returns empty or errors, the symptom is NOT a search error — it looks like the model has no internet access:

1. Model calls `builtin_web_search` ✓
2. Backend returns empty / error (silently)
3. Model retries until `maxToolSteps=4` exhausted (every step: `finish_reason=tool-calls`)
4. `result.text = ""` → `retryEmptyResponse()` fires (see pitfall #2)
5. Retry uses `tools: {}` + `stripToolSections()` — no tools available
6. Model answers from training knowledge: **"我无法访问互联网"** / **"I cannot browse the internet"**

**The root cause is the backend failure, not the model.**

### Backend history

| Backend | Status | Reason dropped |
|---|---|---|
| DuckDuckGo HTML (`html.duckduckgo.com/html/`) | **DROPPED** | Permanently returns HTTP 202 (bot detection) for all Cloudflare Worker datacenter IPs. No bypass exists. |
| BigModel `web_search_prime` MCP | **DROPPED** | Requires stateful 2-step protocol (`initialize` → `tools/call`). Content filter code `1301` blocks all news queries ("今日新闻", "latest news 2026", "today news"). Systematic, not transient. |
| **Serper.dev** (`google.serper.dev/search`) | **CURRENT** | Single `POST` with `X-API-KEY` header, Google results, no bot detection, no content filtering. 2500 free queries/month. |

### Current implementation

```ts
// src/demos/chat/builtin-tools/web-search.ts
const SERPER_URL = "https://google.serper.dev/search";

export async function searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const resp = await fetch(SERPER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!resp.ok) throw new Error(`Serper search failed: HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.organic ?? []).slice(0, 5).map((item) => ({
    title: item.title ?? "", url: item.link ?? "", snippet: item.snippet ?? "",
  }));
}
```

API key stored as Cloudflare secret: `wrangler secret put SERPER_API_KEY`
Env binding declared in `env.d.ts` → passed to `buildAiTools(mcp, context, env.SERPER_API_KEY)`.

### System prompt requirement

GLM-4.7 requires **MANDATORY** instruction strength (not "PREFERRED") to reliably call tools for news queries:

```
"- **Web search (builtin_web_search)**: **MANDATORY** when the user asks about current events,
news, recent developments, real-time data, or anything that may have changed after your training
cutoff. You MUST call this tool — do NOT refuse by saying you cannot access the internet."
```

Using "PREFERRED" causes GLM-4.7 to skip tool calls for organic "搜索今日新闻" requests.

### Replacing the backend in the future

1. Update `src/demos/chat/builtin-tools/web-search.ts` with the new fetch logic
2. Add the new API key as a Cloudflare secret (`wrangler secret put NEW_KEY`)
3. Declare it in `env.d.ts` and pass it through `chat-agent.ts` → `buildAiTools()`
4. Test with: ask "搜索今日新闻" — if AI uses the tool and returns actual news, it works
5. Update this entry

---

## 6. `npm install` requires `--legacy-peer-deps`

**Severity**: Low — install fails without the flag

Due to `zod` v3 vs v4 conflict between packages, `npm install` must always use `--legacy-peer-deps`. The AI SDK internally uses `zod/v4` while the project and `@hono/zod-validator` use zod v3 compatibility mode.

---

## 7. Always use `npm run deploy`, never raw `wrangler deploy`

**Severity**: Critical — deploys stale code

`npm run deploy` runs: `typecheck → vite build → wrangler deploy → verify-deploy`. Skipping the `vite build` step causes the previously built worker code to be deployed, which may be hours or days old.

---

## 8. Client/Server Message ID Mismatch — regenerate/edit/delete fail

**Severity**: High — "Message not found" on retry of the first message

The AI SDK client (`useChat`/`useAgentChat`) generates its own message IDs (nanoid) for both user and assistant messages. During streaming, the server also generates a different assistant ID (format: `assistant_{timestamp}_{random}`). These IDs are only reconciled when the next `sendMessage()` call triggers `_reconcileAssistantIdsWithServerState` in the base class.

**Timeline**:
1. Client sends user message → ID: `nanoid()` — server receives and stores with client's ID ✅
2. Server streams response → assistant ID: `assistant_{ts}_{rand}` — client creates its own ID: `nanoid()` ❌ mismatch
3. Client calls `regenerateFrom(clientAssistantId)` → server searches `this.messages` → NOT FOUND

**Fix**: All mutation methods in `chat-methods.ts` use `resolveMessageIndex()` which falls back to role-based matching (last assistant/user message) when exact ID match fails.

**After hydration** (page refresh, reconnect): `getHistory()` returns server IDs, so the mismatch resolves itself. The problem only occurs between the initial streaming response and the next hydration cycle.

---

## Quick Reference: Tool Call Debugging Checklist

When tool calls are not working in production:

1. **Check tool definition**: Does it use `inputSchema` (not `parameters`)?
2. **Check API request body**: Are `tools` non-empty with correct JSON schemas?
3. **Check API response**: Does it contain `tool_calls` with populated `arguments`?
4. **Check tool execution**: Does `execute` receive the correct `args`?
5. **Check step count**: Is `maxToolSteps` sufficient? Are all steps `tool-calls` with no `stop`?
6. **Check retry path**: Does `retryEmptyResponse` strip tool sections from system prompt?
7. **Check search backend**: Is Serper.dev returning results? Test with `curl -X POST https://google.serper.dev/search -H "X-API-KEY: $SERPER_API_KEY" -H "Content-Type: application/json" -d '{"q":"test","num":3}'`
8. **Check system prompt strength**: Does it say **MANDATORY** (not "PREFERRED") for tool-call triggers?
