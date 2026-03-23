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

Tool triggers live in **three places** that must stay consistent:
1. `src/demos/chat/system-prompt.ts` — "Tool Guide" table
2. `src/demos/chat/builtin-tools/*.ts` — each tool's `description` field
3. `src/demos/chat/runtime/tool-runtime.ts` — `BUILTIN_TOOL_LIST` array

If a constraint appears in only one place, the model may ignore it.

After changing tool rules, run: `python3 scripts/benchmark-prompt.py <label>` (23 queries, ~5 min). Compare `.jsonl` files across runs. Each unnecessary tool call adds 1-3s latency.

## Tool Debugging Checklist

1. Check `_debug.toolCalls` — append `?debug_token=TOKEN` to `/api/chat`
2. Tool receives empty args → likely `parameters` vs `inputSchema` (pitfall #1)
3. 3+ tool calls per message → check system prompt rules are tight enough
4. "Cannot access internet" → search backend failure, not model (pitfall #5)
5. Multiple failures at once → GLM rate limit (pitfall #11); space requests 5s+
6. Post-deploy first request → always warmup first (DO resets)

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
