# ChatWithMe-2 — AI Agent Guide

## Architecture at a Glance

- **Runtime**: Cloudflare Workers + Durable Objects (DO)
- **Agent**: `src/demos/chat/chat-agent.ts` — `ChatAgentV2` extends `AIChatAgent`
- **Model**: GLM-4.7 via `@ai-sdk/openai-compatible` at `open.bigmodel.cn`
- **Entry**: `src/server.ts` (Hono); chat routes in `src/server/routes/chat.ts`
- **Runtime modules**: `src/demos/chat/runtime/` — state, tool, approval, model-execution, chat-methods

## Commands

```bash
npm install --legacy-peer-deps   # always use this flag (zod v3/v4 conflict)
npm run dev                       # local dev
npm run deploy                    # ALWAYS use this (typecheck → build → deploy → verify)
npm run test:run                  # run tests
```

## Critical Rules

1. **`inputSchema` not `parameters`** in `tool()` — `parameters` silently sends empty schema.
2. **`stripToolSections()`** before any `tools: {}` retry call — prevents raw JSON output.
3. **`npm run deploy`**, never `wrangler deploy` — skips Vite build otherwise.
4. **DO reset on first post-deploy request** — always send a warmup first.

Full details: `docs/developer-pitfalls.md`

## Debugging Tool Calls

**Fastest method** — add `?debug_token=TOKEN` to chat request:
```bash
curl -X POST "https://chat2.3we.org/api/chat?debug_token=claude-debug-a952d905222a512e" \
  -H "Content-Type: application/json" \
  -d '{"message":"test","sessionId":"debug-1"}' | python3 -m json.tool
# Check response._debug.toolCalls
```

**Debug API** (session state, history, live SSE):
```bash
BASE="https://chatwithme2mcp.lintao-mailbox.workers.dev"
TOKEN="claude-debug-a952d905222a512e"
AGENT="user-abc12345:session-id"  # userId:sessionId format

curl "$BASE/api/debug/session/$AGENT/info?token=$TOKEN"
curl "$BASE/api/debug/session/$AGENT/history?limit=10&token=$TOKEN"
curl -N "$BASE/api/debug/session/$AGENT/stream?token=$TOKEN&interval=1000"
```

**Structured logs** (when `wrangler tail` works): look for `model_step`, `tool_start`, `tool_done`, `tool_error`, `chat_message_done` in JSON output.

Note: `wrangler tail` may fail on restricted networks — use `_debug` field instead.

## Tool Call Rules

Tool triggers are in `src/demos/chat/system-prompt.ts`. Keep rules targeted, not MANDATORY:
- **web_search**: only for post-cutoff information; not for stable knowledge
- **math_eval**: complex calculations only; not simple arithmetic
- **wikipedia**: only when user explicitly asks to "look up"
- **chart_template**: only for complex chart types (sankey, treemap, etc.)
- **currency**: fiat only (USD/EUR/CNY) — NOT BTC/ETH (use web_search)
- Max 1 search + 1 optional page read per response — never search twice

Unnecessary tool calls add 1-3 s each. Use `_debug.toolCalls` to audit.

## Key Files

| File | Purpose |
|---|---|
| `src/demos/chat/system-prompt.ts` | Tool trigger rules, chart catalog, response guidelines |
| `src/demos/chat/runtime/tool-runtime.ts` | Tool registration, execution wrapper, logging |
| `src/demos/chat/runtime/model-execution.ts` | `streamText`/`generateText` wrappers, per-step logging |
| `src/demos/chat/runtime/chat-methods.ts` | regenerate/edit/delete message logic |
| `src/server/routes/chat.ts` | HTTP routes; `_debug` field injection |
| `src/server/routes/debug.ts` | Debug API endpoints |
| `docs/developer-pitfalls.md` | All known pitfalls with fixes |
