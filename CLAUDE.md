# ChatWithMe‑2 Agent Guidance

## Purpose
The repo `/home/dev/github/chatwithme-2` exists as a focused reference implementation inspired by `/home/dev/github/agents/examples/mcp-client`, `/home/dev/github/agents/examples/playground`, and `/home/dev/github/agents/examples/tictactoe`. It stores the high-level execution plan for refactoring `/home/dev/github/chatwithme` into an Agent-first architecture.

## Priorities
1. Keep the worker and front-end simple so the plan document (`/home/dev/github/chatwithme-2/docs/official-architecture-refactor-execution-plan.md`) is easy to follow.
2. Use this repository only for planning/reference material or as a sandbox for small experiments; real implementation remains in `/home/dev/github/chatwithme`.
3. Maintain absolute-path references when documenting lessons or decisions, so future developers can quickly cross-check with the canonical sources.

## Running & Validation
- This project mirrors `agents/mcp-client` so standard commands are:
  - `npm install` (once, only if you modify dependencies)
  - `npm run dev` to run the Vite-based client against the default agent server in this repo
  - `npm run build` and `wrangler deploy` only after validating that the plan has been implemented in `/home/dev/github/chatwithme`.

## Documentation
- The single source of truth for this repo is `/home/dev/github/chatwithme-2/docs/official-architecture-refactor-execution-plan.md`; append to it when you discover new constraints, test results, or rollout notes.
- For architecture questions, compare this repo's code to references in `/home/dev/github/agents/examples/mcp-client`, `/home/dev/github/agents/examples/playground`, and `/home/dev/github/agents/examples/tictactoe`.

## Collaboration Notes
- Git operations assume a GitHub repo at `https://github.com/<user>/chatwithme-2.git`; adjust the remote once the real URL is available.
- Always note decisions in the docs file before pushing. Keep the repo lightweight to simplify future cloning and reviewing.
