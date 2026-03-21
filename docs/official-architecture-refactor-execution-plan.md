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

## Execution Notes (2026-03-01, session sync refactor hardening)

- Extracted session sync merge/fallback logic into:
  - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionSync.ts`
- Added dedicated session sync orchestration hook:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionSync.ts`
- Added reusable session-view reset defaults:
  - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionLifecycle.ts`
- Updated `/home/dev/github/chatwithme-2/src/client.tsx` to:
  - consume `useSessionSync` instead of inline sync refs/timers
  - reuse `buildSessionViewResetState` for `new/select` reset flows
- Improved observability for fallback paths:
  - `/home/dev/github/chatwithme-2/src/server.ts` now logs failed per-session aggregation in `/api/chat/sessions`
  - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionMeta.ts` now logs localStorage parse failures
- Added tests:
  - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionSync.test.ts`
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionSync.test.tsx`
  - `/home/dev/github/chatwithme-2/src/features/chat/services/sessionLifecycle.test.ts`
- Validation executed and passed:
  - `npm run test:run` (115 tests)
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`

## Execution Notes (2026-03-02, session sync trigger composition)

- Added trigger composition hook:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionSyncTriggers.ts`
  - It now owns `startup`, `session_switch`, `interval`, `visibility`, and exposes `triggerReconnectSync`.
- Updated `/home/dev/github/chatwithme-2/src/client.tsx`:
  - Removed inline startup/session-switch/visibility interval effects.
  - Wired `onOpen` reconnect sync through trigger hook callback.
  - Reduced file size from 1321 lines to 1296 lines.
- Added tests:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionSyncTriggers.test.tsx`
    - startup trigger
    - session switch trigger
    - reconnect trigger
    - interval + visibility trigger
- Validation executed and passed:
  - `npm run test:run` (119 tests)
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`

## Execution Notes (2026-03-02, session history hydration extraction)

- Added hydration hook:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionHistoryHydration.ts`
  - Owns history hydration guards and behavior:
    - skip when not `ready`
    - skip when connection is `disconnected`
    - 3s per-session cooldown
    - same-session signature dedupe
- Updated `/home/dev/github/chatwithme-2/src/client.tsx`:
  - Removed inline hydration refs/effect (`isHydratingRef`, `isResumingRef`, `loadHistoryRef`, cooldown/signature refs)
  - Removed local `buildHistorySignature` helper
  - Integrated `useSessionHistoryHydration(...)`
  - Reduced file size from 1296 lines to 1235 lines
- Added tests:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useSessionHistoryHydration.test.tsx`
    - hydrates when connected and ready
    - skips when disconnected
    - dedupes same-signature updates in same session
- Validation executed and passed:
  - `npm run test:run` (122 tests)
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
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

## Execution Notes (2026-03-01, Full Phase Implementation + Production Deploy)

### Phase 0/1: Lifecycle + Observability Foundation

- Added shared lifecycle utilities:
  - `/home/dev/github/chatwithme-2/src/shared/agent-lifecycle.ts`
- Upgraded base agent lifecycle behavior:
  - `/home/dev/github/chatwithme-2/src/shared/base-agent.ts`
- Applied idle-time cleanup and reconnect schedule cancellation on `ChatAgent`:
  - `/home/dev/github/chatwithme-2/src/demos/chat/chat-agent.ts`

### Phase 2: ChatAgent state single-source migration

- Replaced private MCP runtime state with persisted `ChatAgentState` (`state.mcp`, `state.runtime`).
- Added runtime observability models:
  - `ToolRunRecord`
  - `AgentRuntimeEvent`
- Added callable runtime snapshot API (`getRuntimeSnapshot`) in `ChatAgent`.
- Added tool policy guard + timeout controls:
  - `CHAT_TOOL_TIMEOUT_MS`
  - approval-policy block for high-risk tool names/oversized payloads.

### Phase 3: Contract-first API hardening (Hono + Zod)

- Added Zod request schemas:
  - `/home/dev/github/chatwithme-2/src/schema/api.ts`
- Added HTTP response helpers with unified error contract:
  - `/home/dev/github/chatwithme-2/src/server/http.ts`
- Rebuilt `/home/dev/github/chatwithme-2/src/server.ts` to use:
  - `@hono/zod-validator`
  - requestId middleware
  - unified error envelope: `{ success: false, error: { code, message }, requestId }`
  - new endpoint: `GET /api/runtime/snapshot`

### Phase 4: Tool safety layer

- Added in-agent tool execution governance:
  - run record lifecycle (`running/success/error/blocked`)
  - timeout guard (`Promise.race`)
  - policy block path with runtime event emission

### Phase 5: Testing matrix + new tests

- Added testing matrix doc (since removed):
  - `/home/dev/github/chatwithme-2/docs/testing-chat-agent.md` (archived)
- Added tests:
  - `/home/dev/github/chatwithme-2/src/shared/agent-lifecycle.test.ts`
  - `/home/dev/github/chatwithme-2/src/schema/api.test.ts`
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useEventLog.test.tsx`

### Frontend observability UX upgrades

- Added event log hook:
  - `/home/dev/github/chatwithme-2/src/features/chat/hooks/useEventLog.ts`
- Wired unified event logging to client pipeline and connection lifecycle:
  - `/home/dev/github/chatwithme-2/src/client.tsx`
- Added inspector event log panel:
  - `/home/dev/github/chatwithme-2/src/components/layout/InspectorPane.tsx`
- Added i18n keys for event log labels:
  - `/home/dev/github/chatwithme-2/src/i18n/ui.ts`

### Config and env updates

- Updated environment typing:
  - `/home/dev/github/chatwithme-2/env.d.ts`
- Updated worker vars:
  - `/home/dev/github/chatwithme-2/wrangler.jsonc`

### Validation results

- `npm run typecheck` ✅
- `npm run test:run` ✅
- `npm run lint` ✅
- `npm run build` ✅

### Production deployment and verification

- Deploy command: `npm run deploy` ✅
- Production URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- Version ID: `705fd7b8-9e20-4dbd-9dc8-3751f1926f0f`
- Deploy verification script (`scripts/verify-deploy.mjs`) ✅

### Production tests

- `npm run test:e2e` ✅
  - session id: `e2e-smoke-1772344971330`
- `npm run test:e2e:scroll-lock` ✅
  - result: `success: true`, `jumpDelta: 0`
- `node test/e2e/bottom-growth.production.mjs` ✅
  - result: `ok: true`, `growth: 0`, `topDelta: 0`

## Execution Notes (2026-03-01, Hard Cutover / No-Compatibility Mode)

- User-approved strategy: **hard delete old format/history and remove compatibility paths**.

### Data and runtime cutover

- Durable Object class was cut over from `ChatAgent` to `ChatAgentV2`.
- Wrangler migration kept:
  - `new_sqlite_classes: ["ChatAgentV2"]`
  - `deleted_classes: ["ChatAgent"]`
- Durable binding renamed to `ChatAgentV2` to satisfy Cloudflare deletion constraints.

### Frontend/runtime protocol cutover

- Agent WebSocket route switched from `chat-agent` to `chat-agent-v2` in client.
- Old agent route (`/agents/chat-agent/...`) now intentionally invalid.
- New agent route (`/agents/chat-agent-v2/...`) verified with HTTP 101 WebSocket upgrade.

### Removed compatibility code and dead code

- Removed old `conversationId` fallback and default session fallback in API contract.
- API now strictly requires `sessionId` in request body/query schemas.
- Deleted unused legacy files:
  - `/home/dev/github/chatwithme-2/src/demos/mcp/mcp-client-agent.ts`
  - `/home/dev/github/chatwithme-2/src/shared/base-agent.ts`

### Local history hard reset

- Added session storage versioning in `sessionMeta.ts`.
- On version mismatch, old local keys are cleared:
  - `chatwithme_sessions`
  - `currentSessionId`

### Validation

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:run` ✅

### Production deployment

- Deploy command: `npm run deploy` ✅
- Production URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- Version ID: `e9a5ca1c-af5c-445c-be45-c127b1a37dd6`

### Production verification

- `npm run test:e2e` ✅
- WebSocket handshake check:
  - `wss://chat2.3we.org/agents/chat-agent-v2/...` -> `101 Switching Protocols` ✅
  - `wss://chat2.3we.org/agents/chat-agent/...` -> `400 Invalid request` (expected) ✅

## Execution Notes (2026-03-01, approval-card hardening + UX consistency)

- Hardened tool approval extraction and typing in `/home/dev/github/chatwithme-2/src/components/ToolCallCard.tsx`:
  - Removed `as unknown as` casts.
  - Added discriminated parsing for `dynamic-tool` and `tool-*` parts.
  - Restricted `approvalId` to `[A-Za-z0-9_-]{1,64}` and added malformed-id fallback message in UI.
- Added dedicated approval failure i18n key (`approval_failed`) in `/home/dev/github/chatwithme-2/src/i18n/ui.ts` and migrated approval toast errors in `/home/dev/github/chatwithme-2/src/client.tsx`.
- Replaced approval prop drilling with `ApprovalContext`:
  - Added `/home/dev/github/chatwithme-2/src/features/chat/context/ApprovalContext.tsx`.
  - Removed approval props forwarding in `ChatPane`, `ChatMessageList`, `ChatMessageItem`.
- Improved connection-state feedback in `/home/dev/github/chatwithme-2/src/components/layout/TopBar.tsx` by rendering `ConnectionIndicator` for connecting/connected/disconnected states.
- Documented markdown preferences behavior: chat markdown rendering remains enabled by default via `DEFAULT_MARKDOWN_PREFS` in `/home/dev/github/chatwithme-2/src/components/layout/ChatPane.tsx`; user-facing toggle controls are intentionally removed from the chat toolbar to keep the main flow focused.
- Expanded tests in `/home/dev/github/chatwithme-2/src/components/ToolCallCard.test.ts`:
  - approval id edge cases (empty, malformed, overlong, nested parentheses)
  - approval buttons disabled/busy states
  - invalid approval request hint rendering

## Execution Notes (2026-03-01, REST-first sessions + WS resilience)

### Implemented

- Added session reconciliation endpoint:
  - `GET /api/chat/sessions?sessionIds=<comma-separated ids>` in `/home/dev/github/chatwithme-2/src/server.ts`
  - schema: `chatSessionsQuerySchema` in `/home/dev/github/chatwithme-2/src/schema/api.ts`
- Extended client-side session metadata for long-lived consistency:
  - `health` (`healthy|stale|orphaned`), `mismatchCount`, `lastSyncedAt`, `source`
  - file: `/home/dev/github/chatwithme-2/src/features/chat/services/sessionMeta.ts`
- Switched sidebar session sync to REST-first in `/home/dev/github/chatwithme-2/src/client.tsx`:
  - startup sync + reconnect sync
  - event-triggered sync
  - low-frequency fallback sync (`45s`)
  - in-flight dedupe + `800ms` debounce
- Added `getHistory()` in-flight dedupe and `getSessions()` transport API in `/home/dev/github/chatwithme-2/src/features/chat/services/chatTransport.ts`.
- Improved WS observability:
  - frontend tracks `connection_open/close/error`
  - agent logs `onClose(code/reason/wasClean)` and `onError`
  - added callable `heartbeat()` in `/home/dev/github/chatwithme-2/src/demos/chat/chat-agent.ts`
- Reduced console noise:
  - expanded empty `sourceMappingURL` stripping (`null|undefined|empty`) in `/home/dev/github/chatwithme-2/src/components/MarkdownRenderer.tsx`
  - sanitized invalid SVG `stroke-width`/`height` declarations before preview rendering.
- Optimized highlight loading path in `/home/dev/github/chatwithme-2/src/hooks/useHighlight.ts`:
  - base languages/themes only at bootstrap
  - dynamic `loadLanguage/loadTheme` on demand.

### Test updates

- Added `/home/dev/github/chatwithme-2/src/features/chat/services/chatTransport.test.ts` (concurrent history dedupe).
- Extended `/home/dev/github/chatwithme-2/src/components/MarkdownRenderer.test.tsx` for:
  - `sourceMappingURL=null/undefined` stripping
  - SVG invalid style sanitization.

### Validation

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test:run` ✅
- `npm run build` ✅

### Production deployment and checks

- `npm run deploy` ✅
- Production URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- Version ID: `0cd41b34-1f93-4065-88de-3aaea47491c0`
- Production tests:
  - `npm run test:e2e` ✅
  - `npm run test:e2e:session-delete` ✅
  - `npm run test:e2e:scroll-lock` ✅

### 2026-03-03 Mobile message-variant policy + deployment

- Mobile UX policy updated in `/home/dev/github/chatwithme-2/src/components/layout/ChatPane.tsx`:
  - hide `Bubble/Docs` toggle buttons on mobile
  - force message rendering variant to `docs` on mobile
  - keep desktop toggle behavior unchanged
- User message background in docs view now follows theme via shared `app-user-bubble` class in `/home/dev/github/chatwithme-2/src/components/chat/ChatMessageItem.tsx`.
- Production deployment completed:
  - URL: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
  - Version ID: `813a6048-42f7-4721-8b06-1fd654f77735`

### 2026-03-20 Code review, bug fixes, agent intelligence improvements

#### Key Bug Fix: `jsonSchema not initialized` (critical, pre-existing)

**Root Cause**: When the agent is invoked via `@callable` methods (e.g., `chat()` through `/api/chat` REST endpoint), the code path bypasses `AIChatAgent`'s built-in `onChatMessage()` handler. The `onChatMessage()` handler internally calls `this.mcp.ensureJsonSchema()` before accessing MCP tools. However, the `@callable chat()` → `generateAssistantResponse()` → `buildAiTools()` path never called `ensureJsonSchema()`, so when `mcp.getAITools()` was invoked, the lazy-loaded `jsonSchema` function from `ai` SDK was still `undefined`, causing the error.

**Fix**: Added `await mcp.ensureJsonSchema()` in `tool-runtime.ts` `buildAiTools()` before calling `mcp.getAITools()`. Updated the `ToolExecutionContext.mcp` type to include `ensureJsonSchema: () => Promise<void>`.

**Developer Note**: Any new code path that calls `this.mcp.getAITools()` or `this.mcp.listTools()` MUST first call `await this.mcp.ensureJsonSchema()`. The `@cloudflare/ai-chat` framework only auto-initializes `jsonSchema` in its own `onChatMessage()` flow (WebSocket path). REST/callable entry points must do it manually.

#### Additional Bug Fix: `@hono/zod-validator` compatibility

- `@hono/zod-validator@0.7.6` is incompatible with `zod@3.25.x` (bridge version between v3 and v4). The validator's Standard Schema integration expects APIs that zod 3.25 removed.
- Downgraded to `@hono/zod-validator@0.4.3` which only requires `zod ^3.19.1` and does not depend on Standard Schema.

#### Code Quality Fixes

1. **Duplicate condition removed** (`model-utils.ts`): `name === "builtinwebsearch"` appeared twice in `resolveToolKind()`.
2. **D1 batch optimization** (`chat-sync.ts`): `bindSessionsToUser()` changed from N sequential `INSERT` queries to a single `db.batch()` call.
3. **Message search optimization** (`chat-agent.ts`): Replaced `[...this.messages].reverse().find()` (O(n) copy + reverse) with a simple backward for-loop.
4. **Chart detection false positives reduced** (`system-prompt.ts`): Tightened `isChartRelated` regex — standalone words like `bar`, `plot`, `pie` no longer trigger chart mode; requires compound forms like `bar chart`, `pie chart`.
5. **DDG search deduplication** (`web-search.ts`): Added URL-based deduplication for DuckDuckGo results.

#### Agent Intelligence Improvements

1. **Multi-step research strategy** added to system prompt (both minimal and full variants): teaches the model to search → read best URL → synthesize, and to rephrase queries when search returns empty.
2. **Empty search guidance** (`web-search.ts`): "No results" message now includes guidance to rephrase the query instead of bare failure text.
3. **Smarter fallback retry** (`chat-agent.ts`): When primary model returns empty text, the fallback addendum now includes the user's original question and uses `IMPORTANT:` prefix for stronger model compliance. Removed unreliable `contextEstimate` heuristic.

#### Production Deployment & Testing

- Version ID: `d17aaa66-6184-4826-97af-13a1da8dcfe4`
- Tests: 295/295 unit tests pass, E2E smoke test pass
- Production validation:
  - Health endpoint: OK
  - Chat API (basic math): OK — `1+1=2` response correct
  - Chat API (date awareness): OK — responds with correct system date
  - Chat history persistence: OK — messages persisted and retrievable
  - E2E smoke test (`test:e2e`): PASS

---

## Visual Excellence Plan

The next major initiative is documented in a dedicated plan:
**[Visual Excellence Execution Plan](./visual-excellence-execution-plan.md)**

Goals: ECharts integration, chart export toolbar, interactive tables, KPI cards, dashboard layouts, Excalidraw hand-drawn diagrams, React sandbox, and removal of redundant G2 engine.

## Execution Notes (2026-03-20, Visual Excellence — All 5 Phases Complete)

### Summary

The Visual Excellence Execution Plan (`docs/visual-excellence-execution-plan.md`) has been fully implemented across 5 phases. The system now supports 9 visualization engines, all lazy-loaded.

### Phase 1: Base Experience (completed)

- **ChartToolbar** (`src/components/ChartToolbar.tsx`): floating export toolbar (PNG/SVG/PDF/JSON) on all chart containers
- **InteractiveTable** (`src/components/InteractiveTable.tsx`): sortable/searchable/paginated tables, auto-upgrade for Markdown tables >3 rows. Dependency: `@tanstack/react-table@^8`
- **StatCard** (`src/components/StatCard.tsx`): KPI metric cards via ` ```stat ` code blocks, parsed by `src/utils/statCardParser.ts`
- **G2 engine removed**: deleted `src/utils/g2SpecParser.ts`, `knowledge-base/charts/g2.json`, `src/components/ChartRenderer.test.ts`; removed `@antv/g2` from direct dependencies; g2 code blocks gracefully degrade to JSON display

### Phase 2: ECharts Integration (completed)

- **EChartsRenderer** (`src/components/EChartsRenderer.tsx`): SVG renderer, dark/light theme, ResizeObserver, deferred init via viewport hook. Dependency: `echarts@^5.6`
- **Knowledge base** (`knowledge-base/charts/echarts.json`): 11 chart types — map, sankey, tree, treemap, sunburst, gauge, candlestick, themeRiver, wordCloud, bar3D, scatter3D
- **Keyword mapping**: 50+ keywords (EN+CN) in `chart-knowledge.ts` for automatic engine selection
- **System prompt**: three-engine selection strategy (ADC default → ECharts advanced → Mermaid structural)
- **Build**: `vendor-echarts` lazy chunk ~346 KB gzip

### Phase 3: Editing & Interactions (completed)

- **ChartEditor** (`src/components/ChartEditor.tsx`): slide-out drawer with CodeMirror JSON editor + live preview (300ms debounce). Dependencies: `@codemirror/lang-json`, `codemirror`, `@codemirror/view`, `@codemirror/state`, `@codemirror/theme-one-dark`
- **ADC interactions**: `elementHighlight` + `tooltip` defaults
- **ECharts interactions**: default `toolbox` (zoom/restore/save) + `dataZoom` for xAxis charts
- **Mermaid interactions**: mouse/touch zoom-pan, double-click reset, node hover highlighting, zoom controls UI
- **Animations**: `useInViewport` hook (`src/hooks/useInViewport.ts`) for one-shot viewport-triggered entrance animations; CSS keyframes `chart-fade-in`, `mermaid-node-enter`, `mermaid-edge-draw` in `src/styles.css`

### Phase 4: Advanced Content Types (completed)

- **DashboardRenderer** (`src/components/DashboardRenderer.tsx`): composite grid layout via ` ```dashboard ` code blocks, parsed by `src/utils/dashboardParser.ts`. Supports stat/adc/echarts/text items with responsive grid
- **ExcalidrawRenderer** (`src/components/ExcalidrawRenderer.tsx`): interactive hand-drawn diagrams via ` ```excalidraw ` code blocks. Dependency: `@excalidraw/excalidraw@^0.18`
- **MarkmapRenderer** (`src/components/MarkmapRenderer.tsx`): interactive mind maps via ` ```mindmap ` code blocks with collapse/expand/zoom. Dependencies: `markmap-view`, `markmap-lib`, `markmap-common`. Mermaid mindmap blocks also get a "Switch to interactive" toggle
- **Streaming skeletons**: 7 type-aware chart skeletons during streaming (`src/utils/streamingChartDetector.ts`, enhanced `MessageSkeleton.tsx`): line, bar, pie, mermaid, echarts, stat, generic

### Phase 5: Frontier Capabilities (completed)

- **ReactSandbox** (`src/components/ReactSandbox.tsx`): secure iframe sandbox for ` ```react ` code blocks. Loads React 18, Tailwind, Lucide, Babel from CDN. Security: `sandbox="allow-scripts"` without `allow-same-origin`. Template in `src/utils/reactSandboxTemplate.ts`
- **VegaLiteRenderer** (`src/components/VegaLiteRenderer.tsx`): declarative charts via ` ```vega-lite ` code blocks, parsed by `src/utils/vegaLiteParser.ts`. Knowledge base: `knowledge-base/charts/vega-lite.json` (10 chart types). Dependencies: `vega`, `vega-lite`, `vega-embed`
- **Data analyzer tool** (`src/demos/chat/builtin-tools/data-analyzer.ts`): `builtin_data_analyzer` for CSV/JSON analysis with column type detection, statistics, and chart recommendations. No external dependencies

### Engine Matrix (final)

| Engine | Code Block | Lazy Chunk | Use Case |
|--------|-----------|------------|----------|
| ADC | ` ```adc ` | vendor-adc | Default data charts (line/bar/pie/scatter/radar/area/funnel/heatmap/gauge) |
| ECharts | ` ```echarts ` | vendor-echarts | Advanced charts (map/sankey/tree/treemap/sunburst/candlestick/themeRiver) |
| Mermaid | ` ```mermaid ` | vendor-mermaid | Structural diagrams (flowchart/sequence/ER/state/class/gantt/mindmap) |
| Vega-Lite | ` ```vega-lite ` | (inline+vega) | Declarative/statistical charts (boxplot/facet/layer) |
| Excalidraw | ` ```excalidraw ` | vendor-excalidraw | Hand-drawn sketches, editable diagrams |
| Markmap | ` ```mindmap ` | vendor-markmap | Interactive mind maps (collapse/expand/zoom) |
| StatCard | ` ```stat ` | (inline) | KPI metric cards |
| Dashboard | ` ```dashboard ` | (inline) | Composite layouts (stat + chart grids) |
| React Sandbox | ` ```react ` | (inline+CDN) | Arbitrary React components |
| InteractiveTable | (auto) | (inline) | Markdown tables >3 rows auto-upgrade |

### Builtin Tools (3 total)

| Tool | File | Purpose |
|------|------|---------|
| `builtin_web_search` | `src/demos/chat/builtin-tools/web-search.ts` | DuckDuckGo search |
| `builtin_web_reader` | `src/demos/chat/builtin-tools/web-reader.ts` | Jina Reader URL content |
| `builtin_data_analyzer` | `src/demos/chat/builtin-tools/data-analyzer.ts` | CSV/JSON data analysis + chart recommendations |

### Validation

- `npx tsc --noEmit`: 0 errors
- `npm run test:run`: 33 files, 283 tests, 0 failures
- `npx vite build`: successful (11,217 modules)
- Production deployed to `https://chat2.3we.org/`
- 15 real chat tests: all engines triggered correctly (ADC, ECharts, Mermaid, StatCard, Dashboard)

### File Change Summary

- 47 files changed: +18,550 / -9,043 lines
- 17 new files created (renderers, parsers, tools, hooks)
- 3 files deleted (G2 engine)
- 27 existing files modified
- Commit: `b8ab9f8` on `main`

---

## Appendix: Message ID Mismatch Fix (2026-03-20)

**Problem**: Client AI SDK and server AIChatAgent base class generate different IDs for assistant messages during streaming. The reconciliation only runs on the next `sendMessage()`. Operations like regenerate/edit/delete called before reconciliation fail with "Message not found".

**Root cause**: `_reply()` in AIChatAgent creates assistant ID `assistant_{ts}_{rand}`. The AI SDK `useChat` creates a separate nanoid. No `start` event with `messageId` is emitted by our `createUIMessageStream`, so the server keeps its own ID.

**Fix**: Added `resolveMessageIndex()` in `chat-methods.ts` — falls back from exact ID match to role-based last-message lookup. Applied to `regenerateFrom()`, `editUserMessage()`, `deleteMessage()`.

**Files changed**: `src/demos/chat/runtime/chat-methods.ts`, `docs/developer-pitfalls.md`

---

## Appendix: Production Debugging Infrastructure (2026-03-21)

### Motivation

Production issues (WebSocket errors, GLM anomalies, empty responses) were hard to diagnose because there was no external visibility into Durable Object state. This work adds three layers of observability.

### Changes

**Plan B — Structured JSON logs** (`src/demos/chat/runtime/model-execution.ts`, `src/demos/chat/chat-agent.ts`)

Key structured log events emitted via `console.log(JSON.stringify({...}))` — visible in `wrangler tail --format=json` under `logs[].message[]`:

| event | source | fields |
|---|---|---|
| `ws_connect` | chat-agent | agentName |
| `ws_close` | chat-agent | agentName, code, reason, wasClean |
| `ws_error` | chat-agent | agentName, error |
| `chat_message_received` | chat-agent | agentName, path (ws\|callable), traceId, messageChars, historyLength |
| `chat_message_done` | chat-agent | agentName, path, traceId, durationMs, responseChars, empty |
| `chat_message_error` | chat-agent | agentName, traceId, durationMs, error |
| `model_request` | model-execution | agentName, path, durationMs, responseChars/finalChars, empty |
| `thinking_tags_stripped` | model-execution | agentName, path, before, after |

**Plan A — Debug REST API** (`src/server/routes/debug.ts`, registered in `src/server.ts`)

Protected by `DEBUG_TOKEN` secret. Full workflow documented in `docs/developer-pitfalls.md` §"Production Debugging Workflow".

| endpoint | purpose |
|---|---|
| `GET /api/debug/ping` | connectivity + env vars |
| `GET /api/debug/session/:agentName/state` | DO runtime snapshot |
| `GET /api/debug/session/:agentName/info` | comprehensive: messages + snippets + MCP + snapshot |
| `GET /api/debug/session/:agentName/history` | message history (limit param) |
| `GET /api/debug/session/:agentName/stream` | SSE real-time event stream |
| `GET /api/debug/sessions` | list from D1 (authenticated users only) |

**Plan C — SSE real-time stream** (part of debug.ts above)

Polls the DO's `getRuntimeSnapshot()` every `interval` ms (default 1 s) and pushes new `AgentRuntimeEvent` entries as SSE events. Terminates after `maxSeconds` (default 120, max 300). Closes early after 5 consecutive DO errors.

**New `@callable getDebugInfo()`** (`src/demos/chat/chat-agent.ts`)

Returns agentName, messageCount, lastUserMessage snippet, lastAssistantSnippet, MCP server status, and full runtime snapshot in one RPC call. Used by `/api/debug/session/:agentName/info`.

**Bug fixes found during production testing**:

1. `</think>` tag leak — GLM emits bare `</think>` even with `thinking:disabled`. Fixed by `stripThinkingTags()` in `model-execution.ts` applied to all response paths.
2. `@callable chat()` timeout — no AbortSignal → DO ran 130 s → `outcome:canceled`. Fixed: 55 s `AbortController` in `chat()`, configurable via `CHAT_MODEL_TIMEOUT_MS`.

**New env vars**:
- `DEBUG_TOKEN` (secret) — required to access `/api/debug/*`; set via `wrangler secret put DEBUG_TOKEN`
- `CHAT_MODEL_TIMEOUT_MS` (optional var) — AbortController timeout for `chat()` callable, default 55000

**Files changed**: `src/server/routes/debug.ts` (new), `src/server.ts`, `src/demos/chat/chat-agent.ts`, `src/demos/chat/runtime/model-execution.ts`, `src/demos/chat/runtime-config.ts`, `env.d.ts`, `.dev.vars`, `docs/developer-pitfalls.md`

