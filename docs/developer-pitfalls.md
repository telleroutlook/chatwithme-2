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

The current rule uses targeted language (not a blanket MANDATORY) to balance recall vs. unnecessary calls:

```
"- **Web search (builtin_web_search)**: Use when the user asks about current events, news,
recent developments, real-time data, specific prices/scores/rankings, or anything that may
have changed after your training cutoff. Do NOT use for stable knowledge that you can answer
confidently."
```

**Do not** restore blanket MANDATORY language — it causes unnecessary tool calls for every factual question (see pitfall #14). The current phrasing reliably triggers search for real news queries while skipping it for stable knowledge.

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

## 9. GLM-4.7 leaks `</think>` tags even with `thinking: disabled`

**Severity**: High — the raw tag becomes the visible response

Even with `providerOptions.glm.thinking.type = "disabled"`, GLM-4.7 sometimes emits a bare `</think>` at the start of its response text. The AI SDK does not filter this, so `result.text` contains `"</think>"` and that is stored as the assistant message.

**Fix**: `stripThinkingTags()` in `src/demos/chat/runtime/model-execution.ts` removes complete `<think>...</think>` blocks and lone `</?think>` tags from every model response before it is returned or persisted. Applied to both `requestModelText` and `streamModelTextToWriter`.

**Detection**: Look for `thinking_tags_stripped` in `wrangler tail` logs. Also check `lastAssistantSnippet` via the debug API — if it reads `"</think>"` the strip is not running.

---

## 10. `@callable chat()` had no timeout — DO runs 130 s then gets canceled

**Severity**: High — user sees a 500 after a very long wait; DO wastes resources

The `@callable chat()` path calls `generateAssistantResponse()` → `requestModelText()` → `streamText()` which awaits the GLM API indefinitely. When GLM is slow or the connection stalls, Cloudflare kills the DO after 130 s with `outcome: "canceled"`. No error is surfaced to the client until the HTTP layer times out.

**Fix**: `chat()` now wraps `generateAssistantResponse()` in an `AbortController` with a 55 s deadline (just under Cloudflare's 60 s sub-request limit). Configurable via `CHAT_MODEL_TIMEOUT_MS` env var.

```ts
const timeoutMs = getModelTimeoutMs(this.env);   // default 55000
const controller = new AbortController();
const id = setTimeout(() => controller.abort(), timeoutMs);
try {
  finalResponse = await this.generateAssistantResponse(message, false, controller.signal);
} finally {
  clearTimeout(id);
}
```

**Detection**: `wrangler tail` shows `outcome: "canceled"` and `wallTime > 60000` on the `rpcMethod: "chat"` DO invocation. The structured log for `chat_message_done` will be absent.

---

## 11. GLM API rate-limit causes cascading errors that look like code bugs

**Severity**: Medium — very confusing during testing; looks like multiple different bugs

When the GLM API rate limit is hit (`您的账户已达到速率限制`), the AI SDK retries 3 times then throws `AI_RetryError`. This surfaces as `AI_NoOutputGeneratedError` to the caller, which becomes HTTP 500. Simultaneously, other requests may receive:

- Garbled responses containing system-prompt fragments (GLM partially processes before throttling)
- `</think>` tag as the full response (thinking block leaks through partial response)
- Timeout / empty response

**Root cause**: A single rate-limit event affects all concurrent requests to the same API key.

**Detection rule**: If you see multiple different "bugs" all appear simultaneously during a test session, check for rate limiting first:

```bash
# Check the last DO invocation logs for the rate-limit string
wrangler tail --format=json 2>&1 | grep -o '速率限制'
```

Or via the debug API — `lastError` in the snapshot will contain the rate-limit message.

**Mitigation**: Space test requests at least 5 s apart. The free GLM tier allows ~10 RPM; the paid tier is higher but still limited.

---

## 13. `wrangler tail` may be unavailable — use `_debug` field instead

**Severity**: Medium — wrangler tail fails on some networks/proxies

`wrangler tail` can fail with "fetch failed" errors on restricted networks even after upgrading to 4.76.0 and setting HTTP proxies. Do not rely on it as the primary debugging tool.

**Primary alternative**: The `_debug.toolCalls` field in `/api/chat` responses.

```bash
curl -X POST "https://chat2.3we.org/api/chat?debug_token=claude-debug-a952d905222a512e" \
  -H "Content-Type: application/json" \
  -d '{"message":"your message","sessionId":"test-1"}' | python3 -m json.tool
```

Response includes:
```json
"_debug": {
  "toolCalls": [
    {"tool": "builtin_web_search", "status": "done", "args": "{\"query\":\"...\"}", "durationMs": 1240}
  ]
}
```

This reveals exactly which tools fired, in what order, with what arguments, and how long each took. It's the most reliable tool call inspector since it runs in the same request context as the agent.

**Secondary**: Structured logs via `wrangler tail` when available:
- `model_step`: tool calls per step with token usage
- `tool_start` / `tool_done` / `tool_error`: individual tool timing

---

## 14. Over-aggressive tool rules cause unnecessary latency

**Severity**: High — every unnecessary tool call adds 1-3 s

Tool call rules in `src/demos/chat/system-prompt.ts` directly control how often tools fire. Making rules MANDATORY causes latency spikes. Known offenders:

| Tool | Bad rule | Good rule |
|---|---|---|
| `builtin_web_search` | MANDATORY for any news/event | Only for info newer than training cutoff |
| `builtin_math_eval` | Any calculation | Complex/multi-step only; not simple arithmetic |
| `builtin_wikipedia` | Any factual question | Only when user explicitly says "look up" |
| `builtin_chart_template` | Before every chart | Only for complex types (sankey/treemap/etc.) |
| `builtin_currency` | Any money question | Fiat only; NOT for BTC/ETH |

**Multi-search pattern**: GLM-4.7 will run multiple searches if allowed. The system prompt now enforces "one search, one optional read, never search twice." If you see 3+ tool calls for a single user message, check whether the research strategy rules are present and specific.

**Detection**: Use `_debug.toolCalls` (pitfall #13) to count tools per message. Normal: 0-2 tools. Suspicious: 3+ tools or multiple `builtin_web_search` calls.

---

## 15. `toolRuns` in DO state not visible post-request via separate HTTP call

**Severity**: Low — causes confusion when debugging via the debug API

The debug API endpoint `/api/debug/session/:agentName/state` reads DO state via a separate HTTP request after the chat request completes. Due to DO state isolation, `toolRuns` often appears empty or stale — the previous request's tool run data may not be reflected yet.

**Why**: Each HTTP request to a DO runs in its own isolated execution context. State written during `chat()` may not be flushed/readable by an immediately subsequent debug request.

**Fix**: Use the `_debug.toolCalls` field returned directly by `/api/chat` (pitfall #13) — it reads `toolRuns` within the same request context, after `agent.chat()` completes, so timing is correct.

---

## Quick Reference: Production Debugging Workflow

### Preferred: `_debug` field (works on all networks)

```bash
BASE="https://chat2.3we.org"
TOKEN="claude-debug-a952d905222a512e"

curl -X POST "$BASE/api/chat?debug_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"your test message","sessionId":"debug-1"}' | python3 -m json.tool
# Check: response._debug.toolCalls
```

### Debug API (when you need session history or live streaming)

```bash
BASE="https://chatwithme2mcp.lintao-mailbox.workers.dev"
TOKEN="claude-debug-a952d905222a512e"
AGENT="user-abc12345:my-session-id"   # format: userId:sessionId

# Full snapshot: messageCount, last messages, MCP status, events
curl "$BASE/api/debug/session/$AGENT/info?token=$TOKEN" | python3 -m json.tool

# Last N messages
curl "$BASE/api/debug/session/$AGENT/history?limit=10&token=$TOKEN" | python3 -m json.tool

# Live SSE stream (start before sending message)
curl -N "$BASE/api/debug/session/$AGENT/stream?token=$TOKEN&interval=1000"
```

SSE events to watch:
| event | meaning |
|---|---|
| `runtime_event` with `type: generate_empty_retry` | GLM returned empty; fallback retry fired |
| `tool_run` with `status: error` | specific tool failed |
| `last_error` | error string from most recent failure |

### Tool call debugging checklist

1. Check tool definition uses `inputSchema` (not `parameters`) — pitfall #1
2. Check `_debug.toolCalls` — how many tools fired? Which ones?
3. Check system prompt rules in `system-prompt.ts` — are any MANDATORY when they shouldn't be?
4. Check for GLM rate limit (pitfall #11) — multiple failures simultaneously = rate limit
5. Check Serper.dev: `curl -X POST https://google.serper.dev/search -H "X-API-KEY: $SERPER_API_KEY" -H "Content-Type: application/json" -d '{"q":"test","num":3}'`
6. After any deploy: send a warmup request first — first request always resets the DO

---

## 16. Tool call rules live in three places — all must agree

**Severity**: High — inconsistency causes unpredictable tool usage

Tool call behavior is governed by **three locations**:

1. `src/demos/chat/system-prompt.ts` — "Tool Guide" table in the system prompt
2. `src/demos/chat/builtin-tools/*.ts` — each tool's `description` field in `tool()`
3. `src/demos/chat/runtime/tool-runtime.ts` — `BUILTIN_TOOL_LIST` array (echoed in system prompt)

**If a constraint appears in only one place, the model will sometimes ignore it.** For example, putting "do not call for 123*456" only in the system prompt was unreliable; adding the same constraint to the tool's `description` field made it stick.

### Benchmark tool

After changing any tool rule, run the automated benchmark:

```bash
python3 scripts/benchmark-prompt.py baseline    # before change
python3 scripts/benchmark-prompt.py after-fix    # after change
# Compare: scripts/benchmark-results-baseline.jsonl vs scripts/benchmark-results-after-fix.jsonl
```

The script sends 23 test queries (9 categories: no_tool, search, weather, currency, math, chart, wikipedia, etc.) to production via `curl`, checks `_debug.toolCalls` in responses, and scores pass/fail per query.

**Requirements**:
- Uses `curl`, not Python urllib (Cloudflare blocks urllib's default User-Agent with 403)
- Allow 12s delay between requests to avoid GLM rate limits
- Full run takes ~5 minutes

### Common debugging scenarios

| Symptom | Likely cause | Fix |
|---|---|---|
| Tool fires when it shouldn't | System prompt rule too broad, or tool `description` too eager | Tighten rules in all 3 locations; add concrete "don't call for X" example |
| Tool doesn't fire when it should | Constraint too aggressive ("Do NOT use for...") | Rewrite as positive guidance; check `description` isn't discouraging |
| 3+ tool calls for simple query | Multi-search loop; search budget rule missing or too vague | Add explicit budget: "exactly 1 search per question" |
| Tool gets empty args `{}` | `parameters` instead of `inputSchema` in `tool()` | See pitfall #1 |
| Tool works locally but fails in prod | Missing API key secret, or Cloudflare blocks the target | Check `wrangler secret list`; test target URL from a Worker |

---

**Severity**: High — delete appears to succeed but the message remains in history

The `deleteMessage` callable uses two steps:
1. `this.sql` tagged template to DELETE the row from `cf_ai_chat_agent_messages` by the **in-memory ID** (which is the DB-reconciled ID after `_loadMessagesFromDb`)
2. `persistMessages(filteredMessages)` to update the in-memory state and broadcast to connected clients

**Why not `persistMessages` alone?** The base class `persistMessages` only **upserts** rows (INSERT ON CONFLICT UPDATE). It never deletes rows unless the private `{ _deleteStaleRows: true }` option is passed, which also requires specific preconditions. Without the SQL DELETE, calling `persistMessages([filtered list])` has no effect on the deleted row's DB row — it stays in the database and reappears after the next `_loadMessagesFromDb`.

**Why not SQL DELETE alone?** Without calling `persistMessages`, `this.messages` (the in-memory array) remains stale and doesn't broadcast the change to connected WebSocket clients.

**Correct pattern**:
```ts
// 1. Find message in-memory (DO's this.messages reflects DB state)
const memIndex = msgArray.findIndex((m) => m.id === messageId);
if (memIndex < 0) return { success: true, deleted: false };
const resolvedId = msgArray[memIndex].id!;

// 2. Delete from DB (this.sql is synchronous, returns rows array — empty for DELETE)
this.sql`delete from cf_ai_chat_agent_messages where id = ${resolvedId}`;

// 3. Sync in-memory state + broadcast to WebSocket clients
const nextMessages = msgArray.filter((_, i) => i !== memIndex);
await this.persistMessages(nextMessages);
```

**Key**: `this.sql` returns `T[]` (array of rows), NOT `{ meta: { changes } }` — that's a D1 concept, not DO SQLite.

---