# ChatWithMe‑2 Agent Guidance

## Purpose

This repo is the **production ChatWithMe-2 application** — an AI chat assistant built on Cloudflare Workers + Durable Objects + Agents SDK. It evolved from a planning/reference repo inspired by Cloudflare Agents examples (`mcp-client`, `playground`, `tictactoe`) and now serves as the deployed product.

The architecture refactor execution history is documented in `docs/official-architecture-refactor-execution-plan.md`.

## Priorities

1. Keep the worker and front-end maintainable; the plan document (`docs/official-architecture-refactor-execution-plan.md`) records architectural decisions and execution history.
2. Production URL: `https://chat2.3we.org/` (Cloudflare Workers: `https://chatwithme2mcp.lintao-mailbox.workers.dev`)

## Running & Validation

- Standard commands:
  - `npm install --legacy-peer-deps` (once, only if you modify dependencies — required due to zod v3 vs v4 conflict)
  - `npm run dev` to run the Vite-based client against the default agent server in this repo
  - `npm run deploy` to deploy to production (**ALWAYS use this, never raw `wrangler deploy`**)
    - Runs: `typecheck → vite build → wrangler deploy → verify-deploy`
    - Verify step is **non-fatal** — if it fails (e.g. network timeout), deploy still succeeds
    - Skipping `vite build` causes stale Worker code to be deployed
  - `npm run deploy:raw` for quick deploy (skips typecheck + verify, but still builds)
  - `npm run test:run` to run all tests before deploying

## Critical Developer Rules

> **Read `docs/developer-pitfalls.md` for full details.**

1. **Tool definitions**: Use `inputSchema` (NOT `parameters`) with `tool()` from `ai`.
2. **Retry without tools**: Strip tool descriptions via `stripToolSections()` before any `tools: {}` call.
3. **Streaming + empty result.text**: `streamText`'s `result.text` can be `""` when all steps are tool-calls. Track streamed text independently.
4. **Deploy safety**: Always `npm run deploy`, never raw `wrangler deploy`.
5. **Install safety**: Always `npm install --legacy-peer-deps`.

## Production Debugging

`wrangler tail` may be unavailable (network/proxy issues). Use these instead:

**Inline tool call info** — append `?debug_token=TOKEN` to any `/api/chat` POST:
```bash
curl -X POST "https://chat2.3we.org/api/chat?debug_token=claude-debug-a952d905222a512e" \
  -H "Content-Type: application/json" \
  -d '{"message":"...","sessionId":"test-1"}' | python3 -m json.tool
# Response includes _debug.toolCalls: [{tool, status, args, durationMs}, ...]
```

**Debug API** (protected by `DEBUG_TOKEN`):
```bash
BASE="https://chatwithme2mcp.lintao-mailbox.workers.dev"
TOKEN="claude-debug-a952d905222a512e"
AGENT="user-abc12345:session-id"   # format: userId:sessionId

curl "$BASE/api/debug/session/$AGENT/info?token=$TOKEN"    # state + MCP status
curl "$BASE/api/debug/session/$AGENT/history?token=$TOKEN" # message history
curl -N "$BASE/api/debug/session/$AGENT/stream?token=$TOKEN&interval=1000" # SSE stream
```

**Structured logs** — emitted as JSON to `console.log`, visible in `wrangler tail --format=json` when available:
- `model_step`: per-step tool calls, token usage, finish reason
- `tool_start` / `tool_done` / `tool_error`: individual tool execution with duration
- `chat_message_done`: total duration per message
- `thinking_tags_stripped`: GLM `</think>` leak detection

**After deploy**: first request to a session always triggers a DO reset — do a warmup request first.

## Tool Call Optimization

System prompt rules govern when tools fire. Over-aggressive rules cause unnecessary latency.
Current rules in `src/demos/chat/system-prompt.ts` — key principles:
- Web search: use only for information newer than training cutoff; NOT for stable knowledge
- Math eval: only for complex/multi-step calculations; not for simple arithmetic
- Wikipedia: only when user explicitly asks to "look up" something
- Chart template: only for complex/uncommon chart types; not for common ones
- "One search, one optional read, never search twice" — prevents multi-search chains
- Currency: fiat only (USD/EUR/CNY); NOT for BTC/ETH (use web search instead)

## Documentation

- Architecture decisions: `docs/official-architecture-refactor-execution-plan.md`
- Pitfalls & lessons: `docs/developer-pitfalls.md` — read before touching tools, streaming, or retry paths
- Visual excellence plan: `docs/visual-excellence-execution-plan.md`
