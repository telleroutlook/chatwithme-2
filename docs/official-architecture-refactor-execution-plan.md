# Official Architecture Refactor Execution Plan

## 1. Objective

- Align `/home/dev/github/chatwithme` with Cloudflare Agents best practices while keeping the existing REST + DB contracts intact during transition.
- Use `/home/dev/github/agents/examples/mcp-client` as the primary architectural reference for Agent/Durable Object wiring, `/home/dev/github/agents/examples/playground` for state management patterns, and `/home/dev/github/agents/examples/tictactoe` for structured state synchronization.
- Ship a single-agent, `useAgent`-driven front end that replaces `/chat/respond` as the primary message path while letting the old REST endpoint remain a short-term compatibility shim.

## 2. Key References

1. `/home/dev/github/agents/examples/mcp-client`: Agent lifecycle, durable object bindings, OAuth callback handling, and client-side `useAgent` setup that will become the blueprint for `chatwithme-2`.
2. `/home/dev/github/agents/examples/playground`: `PlaygroundAgent` base class for idle-time cleanup, `mcp-client-agent` for tool lifecycle, and `state-agent` telemetry to copy persistence strategies.
3. `/home/dev/github/agents/examples/tictactoe`: JSON-based board state, callable methods, and `onStateUpdate` usage that inspire the structured events the front end will render (charts, tables, text blocks).
4. `/home/dev/github/chatwithme`: Existing production project whose routes, DAO layers, and documentation define the business contract we cannot break.

## 3. Setup & Preparation (before writing code)

1. Inspect `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts` and `/home/dev/github/chatwithme/apps/api/src/agents/mcp-agent.ts` to capture the current MCP tool execution loop; document exactly which REST inputs map to D1 writes or MCP calls.
2. Read `/home/dev/github/chatwithme/apps/web/app/pages/home/hooks/useChatActions.ts` and `/home/dev/github/chatwithme/apps/web/app/lib/chatFlow.ts` so you understand how the UI currently drives REST and which pieces will become Agent state consumers.
3. Verify the Wrangler config at `/home/dev/github/chatwithme/apps/api/wrangler.toml` for bindings that must be preserved, especially `MCPAgent`, `DB`, and `ASSETS`.
4. Note existing migrations at `/home/dev/github/chatwithme/apps/api/migrations` and decide whether new schema changes are needed for `ChatAgentState` persistence (prefer writing a new migration tagged `v4`).

## 4. Execution Phases (clear tasks per phase)

### Phase 0 – Baseline & Guardrails

- Run `npm run lint && npm run typecheck && npm run test && npm run build` from `/home/dev/github/chatwithme` to document passing baseline status before refactor.
- Create a traceable list of REST contracts (conversation list, message list, `/chat/respond`, `/auth/*`, `/file/*`) and mark them as “must-maintain during transition”.
- Record current MCP integration steps, including `parseToolCalls`, `callTool`, and `mcpAgentStub.isConfigured()` usage, so the Agent rewrite can reproduce every path. Save notes under `/home/dev/github/chatwithme/docs/` for quick reference.

### Phase 1 – Agent Entry Point & Durable Object Setup

- In `/home/dev/github/chatwithme/apps/api/src/index.ts`, add `routeAgentRequest(request, env, { cors: true })` to the top-level fetch handler and ensure static asset routing still covers the React SPA.
- Introduce `/home/dev/github/chatwithme/apps/api/src/agents/chat-agent.ts` (new file); copy service wiring from `/home/dev/github/agents/examples/mcp-client/src/server.ts` but tailor `initialState` to the chat domain and attach `ChatAgent` to Durable Object binding in `/home/dev/github/chatwithme/apps/api/wrangler.toml`.
- Append a new migration file under `/home/dev/github/chatwithme/apps/api/migrations` that registers `ChatAgent` (tag `v4`, `new_sqlite_classes` includes `ChatAgent`).
- Create agent callable skeletons for `sendMessage`, `connectMcpServer`, `disconnectServer`, `listTools`, and `callTool`, referencing `this.mcp` usage from `/home/dev/github/agents/examples/playground/src/demos/mcp/mcp-client-agent.ts`.
- Verify that `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts` still works by calling the existing REST endpoints (this keeps the UI running while new agent wiring is added). Document the interplay in `/home/dev/github/chatwithme-2/docs/official-architecture-refactor-execution-plan.md` as part of the plan’s checklist.

### Phase 2 – Tool & Model Logic Inside ChatAgent

- Port the tool discovery, selection, and execution logic from `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts` (around lines 1115-1337) into `ChatAgent.sendMessage`; keep the `parseToolCalls` helper temporarily but flag it for removal once the agent handles calls and returns structured `uiBlocks` (text + tool results).
- Implement a consistent state update that records `messages`, `toolRuns`, and `uiBlocks` in `ChatAgentState`. Use `enum`-like status strings for `toolRuns` (`running`, `success`, `error`) so the front end can render progress and errors deterministically.
- Ensure `ChatAgent` can perform the dual-model strategy (primary/fallback) by reusing `buildModelCandidates` and `withModelTimeout` logic from `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts`, but change `c.env` usage to `this.env` and log `traceId` plus `conversationId` for observability.
- Persist MCP tool results by turning them into structured `uiBlocks` (e.g., text summary, table rows, chart configs) similar to `/home/dev/github/agents/examples/tictactoe/src/server.ts` state updates; include fallback error objects inside `uiBlocks` where calls fail.
- Keep `/chat/respond` intact by internally calling `ChatAgent.sendMessage` through `routeAgentRequest` and rewriting the response to match the existing schema so older clients still work.

### Phase 3 – Frontend `useAgent` Migration

- Introduce `/home/dev/github/chatwithme/apps/web/app/lib/agentClient.ts` as the single entry point for `useAgent`, mirroring `/home/dev/github/agents/examples/mcp-client/src/client.tsx` session handling but customized to the new agent name (e.g., `chat-agent`).
- Refactor `/home/dev/github/chatwithme/apps/web/app/pages/home/hooks/useChatActions.ts` so `handleSendMessage` calculates the same payload (conversationId, message, files, model) but calls `agent.call('sendMessage', payload)`; handle the agent’s `onStateUpdate` to hydrate React state instead of relying solely on REST responses.
- Update `/home/dev/github/chatwithme/apps/web/app/pages/home/index.tsx` (or the child components it renders) to subscribe to `agentState.messages` and `agentState.uiBlocks`, rendering plain text, tables, or charts accordingly; adopt the structured UI block concept from `/home/dev/github/agents/examples/tictactoe/src/client.tsx` for board-like deterministic rendering.
- Keep React Query hooks like `useConversations` and `useMessages` to seed the Agent state when the page loads, but mark them as “warm cache” paths rather than the authoritative source.
- Ensure the front end retains login/logout flows (relying on `/auth/*` endpoints) to avoid breaking security assumptions.

### Phase 4 – Cleanup & Documentation

- Delete `/home/dev/github/chatwithme/apps/api/src/mcp/parser.ts` once `ChatAgent` fully owns tool parsing, and remove any unused `parseToolCalls` references from `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts`.
- Replace the CLI plan document at `/home/dev/github/chatwithme/docs/official-architecture-refactor-execution-plan.md` (existing copy) with the version stored in this new repo; remove duplicate instructions after verifying the new doc is comprehensive.
- Extend documentation with a single-page runbook at `/home/dev/github/chatwithme-2/docs/official-architecture-refactor-execution-plan.md` (this file) so future contributors know exactly which directories and files to reference.
- After tests pass, run `wrangler deploy --dry-run` from `/home/dev/github/chatwithme` to verify configuration compatibility, then update the plan doc with the result and any outstanding issues.

## 5. Testing & Verification Tasks

1. Unit tests for `ChatAgent.sendMessage` (no tools, single tool, multi-tool, JSON parse failure, model timeout). Use Vitest or the existing test harness under `/home/dev/github/chatwithme/apps/api/src`.
2. Integration: WebSocket connection to `/agents/chat-agent/<sessionId>` via `/home/dev/github/chatwithme-2/src/client.tsx` (new file) should stream state updates; verify `toolRuns` statuses reflect executed MCP calls.
3. End-to-end: Use the existing `/home/dev/github/chatwithme/apps/web` UI (after hooking into `useAgent`) to start a conversation, trigger a tool search, upload an image, and inspect rendered `uiBlocks` (text, table, charts).
4. Regression: Run `npm run lint && npm run typecheck && npm run test && npm run build` from `/home/dev/github/chatwithme-2` to ensure no lint/type failures before pushing the branch.

## 6. Deployment & Rollout Notes

- After first commit in `/home/dev/github/chatwithme-2`, push to `https://github.com/<user>/chatwithme-2.git` and set `main` as default branch.
- Use the same Git identity already configured globally (no additional `git config` changes required).
- Document rollout checkpoints (agent readiness, front-end state sync, REST compatibility) inside this file so the next maintainer knows when to flip the feature flag or revert.

## 7. Next Steps Once Development Starts

1. Execute Phase 0 tasks; capture command outputs and add short notes to this file following the section “Setup & Preparation”.
2. After Phase 1 completes, update the plan with the location of the new files (`/home/dev/github/chatwithme/apps/api/src/agents/chat-agent.ts` and `/home/dev/github/chatwithme-2/docs/official-architecture-refactor-execution-plan.md`).
3. Use GitHub actions or a local script to automate the lint/type/test/build pipeline before pushing updates from `/home/dev/github/chatwithme-2`.
4. Keep the documentation in this file as the single source of truth for the architecture refactor; extend it only by appending new numbered sections or bullet points.

---

## 8. Implementation Status (Updated 2026-02-27)

### Completed Tasks

#### Phase 1: ChatAgent Foundation

- **File Created**: `/home/dev/github/chatwithme/apps/api/src/agents/chat-agent.ts`
  - Extends `Agent<Env, ChatAgentState>` from Cloudflare Agent SDK
  - Implements lifecycle hooks: `onStart`, `onConnect`, `onClose`, `onIdleTimeout`
  - 15-minute idle timeout with automatic cleanup
  - MCP connection management (reuses MCPAgent pattern)
  - Callable methods: `initializeConversation`, `sendMessage`, `listTools`, `getState`, `resetState`

#### Phase 2: Core Logic Port

- **Ported from** `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts`:
  - `buildModelCandidates` (simplified - no image models)
  - `buildOpenAIMessages`
  - `buildStructuredReplyMessages`
  - `parseCompletionText`
  - `parseStructuredReply`
  - Two-phase LLM calls (tool execution + final response)
  - Tool execution status tracking (`ToolRun` state machine)

#### Phase 3: Frontend Agent Client

- **File Created**: `/home/dev/github/chatwithme/apps/web/app/lib/agentClient.ts`
  - `useChatAgent` hook (REST + header mode for now)
  - `useAgentOrRest` hook (smart Agent vs REST selection)

- **File Created**: `/home/dev/github/chatwithme/packages/shared/src/agent-types.ts`
  - Shared types: `ChatAgentState`, `ToolRun`, `ChatUIBlock`, `SendMessageParams`, `SendMessageResult`

#### Phase 4: REST Compatibility Layer

- **Modified**: `/home/dev/github/chatwithme/apps/api/src/routes/chat.ts`
  - Added `X-Use-Agent` header detection in `/chat/respond`
  - Agent path on success, fallback to REST on error

- **Modified**: `/home/dev/github/chatwithme/apps/web/app/pages/home/hooks/useChatActions.ts`
  - Added `USE_AGENT_MODE` feature flag (controlled by `VITE_USE_AGENT` env var)
  - Added `getApiHeaders()` helper to inject `X-Use-Agent` header

#### Configuration Updates

- **Modified**: `/home/dev/github/chatwithme/apps/api/wrangler.toml`
  - Added `ChatAgent` binding
  - Added v4 migration

- **Modified**: `/home/dev/github/chatwithme/apps/api/src/index.ts`
  - Added `routeAgentRequest` for WebSocket routing
  - Exported `ChatAgent` class

- **Modified**: `/home/dev/github/chatwithme/apps/api/src/store-context.ts`
  - Added `ChatAgent` type to `Env` interface

### Verification Results

```
✅ Lint: Passed (4 prettier warnings only)
✅ TypeCheck: All packages passed
✅ Build: Successful
   - MCPAgent Durable Object ✓
   - ChatAgent Durable Object ✓
   - All bindings ready ✓
✅ Tests: 180 tests passed
```

### How to Enable Agent Mode

1. Set environment variable: `VITE_USE_AGENT=true`
2. The frontend will automatically include `X-Use-Agent: true` header
3. The API will route requests through ChatAgent instead of REST

### File Change Summary

| File                                              | Type     |
| ------------------------------------------------- | -------- |
| `apps/api/src/agents/chat-agent.ts`               | Created  |
| `apps/api/src/index.ts`                           | Modified |
| `apps/api/src/store-context.ts`                   | Modified |
| `apps/api/wrangler.toml`                          | Modified |
| `apps/api/src/routes/chat.ts`                     | Modified |
| `apps/web/app/lib/agentClient.ts`                 | Created  |
| `apps/web/app/pages/home/hooks/useChatActions.ts` | Modified |
| `packages/shared/src/agent-types.ts`              | Created  |
| `packages/shared/src/index.ts`                    | Modified |

### Known Limitations

1. Frontend `agentClient.ts` uses REST + header mode, not full WebSocket
2. Agent state is not fully synchronized with D1 database (messages are stored in both)
3. Full WebSocket streaming UI updates are not yet implemented

### Future Enhancements

1. Implement full WebSocket connection using `useAgent` from `agents/react`
2. Add real-time state streaming for `toolRuns` and `uiBlocks`
3. Implement UI block rendering components (`TextBlock`, `ToolResultBlock`, etc.)
4. Add unit tests for ChatAgent methods

## Execution Notes (2026-02-28)

- Updated `/home/dev/github/chatwithme-2/src/components/layout/TopBar.tsx` to remove combined theme/language control from header.
- Updated `/home/dev/github/chatwithme-2/src/components/layout/WorkspaceSidebar.tsx` to add dedicated Settings controls for Theme mode and Language, each configured separately.
- Added lint/format toolchain in `/home/dev/github/chatwithme-2/package.json`, `/home/dev/github/chatwithme-2/eslint.config.mjs`, and `/home/dev/github/chatwithme-2/.prettierrc`.
- Ran `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run format` in `/home/dev/github/chatwithme-2`.
- Production deployment executed via `npm run deploy` from `/home/dev/github/chatwithme-2`.

## Execution Notes (2026-02-28, Lobe-UI inspired upgrade)

- Added chat domain UX/state modules:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useChatAutoScroll.ts`
  - `/home/dev/github/chatwithme-2/src/features/chat/services/trackChatEvent.ts`
- Upgraded chat interaction components:
  - `/home/dev/github/chatwithme-2/src/components/layout/ChatPane.tsx`
  - `/home/dev/github/chatwithme-2/src/components/ChatInput.tsx`
  - `/home/dev/github/chatwithme-2/src/components/chat/ChatInputArea.tsx`
  - `/home/dev/github/chatwithme-2/src/components/chat/ChatMessageItem.tsx`
  - `/home/dev/github/chatwithme-2/src/components/chat/ChatMessageList.tsx`
  - `/home/dev/github/chatwithme-2/src/components/chat/BackToBottom.tsx`
  - `/home/dev/github/chatwithme-2/src/components/chat/LoadingDots.tsx`
- Added i18n keys for composer expand/collapse, message view variants, and auto-scroll states in `/home/dev/github/chatwithme-2/src/i18n/ui.ts`.
- Added tests:
  - `/home/dev/github/chatwithme-2/src/components/chat/ChatMessageItem.test.tsx`
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useChatAutoScroll.test.ts`
- Quality gates executed and passed:
  - `npm run test:run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Production deployment executed by `npm run deploy`.
  - Worker URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
  - Version ID: `567812e6-f950-4680-8773-428bad5be743`
- Production smoke tests executed:
  - `GET /` returned `HTTP/2 200`
  - `GET /api/chat/history?sessionId=prod-smoke-20260228` returned success payload
  - `GET /api/mcp/servers?sessionId=prod-smoke-20260228` returned success payload
  - `POST /api/chat` returned success payload and assistant response
  - `DELETE /api/chat/history?sessionId=prod-smoke-20260228` returned success payload
- Negative case `POST /api/chat/edit` without required fields returned expected error payload

## Execution Notes (2026-03-01, Remaining-items completion pass)

- Continued implementation against remaining checklist items:
  - Refactored `client.tsx` to use extracted chat domain services:
    - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionMeta.ts`
    - `/home/dev/github/chatwithme-2/src/features/chat/services/progress.ts`
  - Extended ChatPane with:
    - MCP status summary card
    - connection retry action
    - markdown runtime toggles (`Stream`, `Alerts`, `Footnotes`)
  - Extended message rendering chain for markdown preferences:
    - `ChatPane -> ChatMessageList -> ChatMessageItem -> MarkdownRenderer`
  - Added error retry surface in message item for error-like assistant content.
  - Added markdown feature toggles in renderer (`enableAlerts`, `enableFootnotes`, `streamCursor`) with preprocessing and footnote stripping fallback.
- Added/updated tests:
  - `/home/dev/github/chatwithme-2/src/components/MarkdownRenderer.test.tsx`
- Validation gates passed:
  - `npm run test:run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Production deployment:
  - URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
  - Version ID: `4d2d6bfd-d8b2-4387-a445-48abe516d44d`
- Production smoke tests:
  - `GET /` -> `HTTP/2 200`
  - `GET /api/chat/history?sessionId=prod-smoke-20260301-b` -> success
  - `GET /api/mcp/servers?sessionId=prod-smoke-20260301-b` -> success
  - `POST /api/chat` -> success
  - `POST /api/chat/edit` missing fields -> expected validation error
  - `DELETE /api/chat/history?sessionId=prod-smoke-20260301-b` -> success

## Execution Notes (2026-03-01, Plan 100% Completion)

### Remaining-items checklist (all completed)

- [x] 1. Further modularize `client.tsx`
  - extracted API contract guards/types into `/home/dev/github/chatwithme-2/src/features/chat/services/apiContracts.ts`
  - extracted command suggestion builder into `/home/dev/github/chatwithme-2/src/features/chat/services/commandSuggestions.ts`
  - extracted telemetry hook + snapshot aggregator into:
    - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useChatTelemetry.ts`
    - `/home/dev/github/chatwithme-2/src/features/chat/services/observability.ts`

- [x] 2. Productize markdown citations
  - added citation cards: `/home/dev/github/chatwithme-2/src/components/CitationCards.tsx`
  - added source URL extraction and group pass-through:
    - `/home/dev/github/chatwithme-2/src/types/message-sources.ts`
    - `/home/dev/github/chatwithme-2/src/components/MessageSources.tsx`
  - wired citations into markdown message rendering:
    - `/home/dev/github/chatwithme-2/src/components/chat/ChatMessageItem.tsx`
    - `/home/dev/github/chatwithme-2/src/components/MarkdownRenderer.tsx`

- [x] 3. Improve observability
  - added telemetry event capture + aggregation + inspector panel visualization
  - inspector telemetry section localized via i18n keys in `/home/dev/github/chatwithme-2/src/i18n/ui.ts`

- [x] 4. Add fuller E2E automation
  - added production smoke script: `/home/dev/github/chatwithme-2/test/e2e/smoke.production.mjs`
  - added npm entry: `npm run test:e2e`

### Validation and release gate

- Passed locally before release:
  - `npm run test:run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:e2e`
- Production deployed after completion pass via `npm run deploy`.

### Production release record (2026-03-01)

- Deploy command: `npm run deploy`
- URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- Version ID: `237a4b91-0b9d-40fb-a1ed-c324620a198c`
- Post-deploy smoke test: `npm run test:e2e` passed
  - session id: `e2e-smoke-1772326426292`
