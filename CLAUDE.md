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
    - Skipping `vite build` causes stale Worker code to be deployed
  - `npm run deploy:raw` for quick deploy (skips typecheck + verify, but still builds)
  - `npm run test:run` to run all tests before deploying

## Critical Developer Rules

> **Read `docs/developer-pitfalls.md` for full explanations, code examples, and debugging checklists.**

1. **Tool definitions**: Use `inputSchema` (NOT `parameters`) with `tool()` from `ai`. Using `parameters` silently sends an empty schema to the model.
2. **Retry without tools**: Any code path calling the model with `tools: {}` must strip tool descriptions from the system prompt via `stripToolSections()`. Otherwise the model outputs raw JSON tool calls as text.
3. **Streaming + empty result.text**: `streamText`'s `result.text` can be `""` when all steps end with tool-calls. Track streamed text independently and avoid duplicate output on retry.
4. **Deploy safety**: Always `npm run deploy`, never raw `wrangler deploy` — the latter skips the Vite build and deploys stale code.
5. **Install safety**: Always `npm install --legacy-peer-deps` due to zod v3/v4 peer dep conflict.

## Documentation

- The execution history and architecture decisions are in `docs/official-architecture-refactor-execution-plan.md`; append to it when you discover new constraints, test results, or rollout notes.
- **Developer pitfalls and lessons learned** are in `docs/developer-pitfalls.md`; read this before modifying tool definitions, streaming logic, or the retry/fallback paths.

## Collaboration Notes

- Git operations assume a GitHub repo at `https://github.com/<user>/chatwithme-2.git`; adjust the remote once the real URL is available.
- The visual excellence execution plan and its completion status are documented in `docs/visual-excellence-execution-plan.md`.
- Always note decisions in the docs file before pushing. Keep the repo lightweight to simplify future cloning and reviewing.
