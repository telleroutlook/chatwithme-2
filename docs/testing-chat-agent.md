# Chat Agent Testing Matrix

## Scope

This matrix validates lifecycle stability, MCP connectivity, tool execution controls, and API contract consistency.

## Environment

1. Run `npm run dev` for local checks.
2. Use `npm run deploy` before production smoke tests.
3. Set `E2E_BASE_URL` when testing non-default production URLs.

## Scenarios

1. Connection lifecycle
- Open app and verify agent reaches connected state.
- Close tab or disconnect websocket and verify `connection_closed` event is logged.
- Reconnect and confirm idle cleanup schedule is canceled.

2. Idle timeout cleanup
- Leave session with no active connection for configured timeout (`AGENT_IDLE_TIMEOUT_SECONDS`).
- Verify agent emits `idle_destroy` runtime event.
- Reopen with same session and ensure a fresh instance is created.

3. MCP activation/deactivation
- Toggle each preconfigured server on and off.
- Confirm API returns `stateVersion` increments.
- Validate unavailable server name returns contract error (`MCP_SERVER_TOGGLE_FAILED`).

4. Tool execution policy
- Trigger safe tools and verify `tool_start` + `tool_success` events.
- Trigger blocked tools (names containing delete/remove/update) and verify policy block error.
- Simulate slow tool response and verify timeout behavior (`CHAT_TOOL_TIMEOUT_MS`).

5. Chat flows
- Send message -> receive streamed response.
- Edit user message and regenerate from edited point.
- Fork session from a message and verify new session history.

6. API contract checks
- All validation failures return:
  - `success: false`
  - `error: { code, message }`
  - `requestId`
- Success payloads include `success: true` and `requestId`.

7. Observability
- Verify inspector panel shows:
  - live pipeline events
  - telemetry summary
  - event log entries
- Use clear action to reset event log in UI.

## Automated Commands

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

## Release Gate

Deploy only after all checks pass and production smoke (`npm run test:e2e`) succeeds.
