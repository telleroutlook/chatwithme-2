/**
 * Debug API routes for production system inspection.
 *
 * Protected by DEBUG_TOKEN env var — all endpoints return 404 if not set.
 * Usage: add `?token=<DEBUG_TOKEN>` or `Authorization: Bearer <DEBUG_TOKEN>` header.
 *
 * Endpoints:
 *   GET /api/debug/ping                               — connectivity check
 *   GET /api/debug/session/:agentName/state           — DO runtime state + events
 *   GET /api/debug/session/:agentName/history         — chat message history
 *   GET /api/debug/session/:agentName/stream          — SSE real-time event stream
 *   GET /api/debug/sessions                           — list sessions from D1
 */

import { Hono } from "hono";
import { getAgentByName } from "agents";
import { errorJson, successJson, unknownErrorMessage } from "../http";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Always compare full length of the longer string to avoid length leakage
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Redact sensitive patterns from debug output (API keys, emails, Bearer tokens).
 */
function redactSensitiveContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  return content
    .replace(/\b(sk-|Bearer\s)[A-Za-z0-9\-_]{8,}/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/(["']?(?:api[_-]?key|apikey|token|secret|password|passwd)["']?\s*[:=]\s*)["']?[A-Za-z0-9\-_./+]{8,}["']?/gi, "$1[REDACTED]");
}

/**
 * Verify debug token from Authorization header or ?token= query param.
 * Uses constant-time comparison to prevent timing attacks.
 */
function verifyDebugToken(request: Request, debugToken: string): boolean {
  const url = new URL(request.url);

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return timingSafeEqual(authHeader.slice(7).trim(), debugToken);
  }

  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    return timingSafeEqual(tokenParam.trim(), debugToken);
  }

  return false;
}

/** Format a Server-Sent Events message */
function sseEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Validate agentName format: must be "userId:sessionId" with safe characters only. */
function validateAgentName(agentName: string): boolean {
  // userId part: hex16, user-hex8, or anon-hex8
  // sessionId part: alphanumeric + hyphens/underscores
  return /^([\w\-]+):([\w\-]+)$/.test(agentName) && agentName.length <= 200;
}

export function registerDebugRoutes(app: Hono<AppBindings>): void {
  // Guard middleware: block all /api/debug/* if DEBUG_TOKEN not configured or token mismatch
  app.use("/api/debug/*", async (c, next) => {
    const debugToken = c.env.DEBUG_TOKEN;
    if (!debugToken) {
      return c.notFound();
    }
    if (!verifyDebugToken(c.req.raw, debugToken)) {
      return errorJson(c, 401, "DEBUG_UNAUTHORIZED", "Invalid or missing debug token");
    }
    await next();
  });

  // ── Ping ──────────────────────────────────────────────────────────────────

  app.get("/api/debug/ping", (c) => {
    return successJson(c, {
      pong: true,
      timestamp: new Date().toISOString(),
      env: {
        model: c.env.CHAT_MODEL_ID ?? "(not set)",
        stream: c.env.CHAT_MODEL_STREAM ?? "(not set)",
        host: c.env.HOST ?? "(not set)",
        hasSerperKey: !!c.env.SERPER_API_KEY,
        debugEnabled: true,
      }
    });
  });

  // ── Session state (DO runtime snapshot) ───────────────────────────────────

  app.get("/api/debug/session/:agentName/state", async (c) => {
    const agentName = decodeURIComponent(c.req.param("agentName"));
    if (!validateAgentName(agentName)) {
      return errorJson(c, 400, "INVALID_AGENT_NAME", "Invalid agentName format");
    }
    try {
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const snapshot = await agent.getRuntimeSnapshot();
      const drResult = await agent.getDeepResearch() as { deepResearch: boolean };
      return successJson(c, { agentName, snapshot, deepResearch: drResult?.deepResearch ?? false });
    } catch (error) {
      return errorJson(c, 500, "DEBUG_STATE_ERROR", unknownErrorMessage(error));
    }
  });

  // ── Comprehensive debug info ───────────────────────────────────────────────
  //
  // Returns agentName, messageCount, last user/assistant snippet, MCP server
  // status, and the full runtime snapshot — all in one call.

  app.get("/api/debug/session/:agentName/info", async (c) => {
    const agentName = decodeURIComponent(c.req.param("agentName"));
    if (!validateAgentName(agentName)) {
      return errorJson(c, 400, "INVALID_AGENT_NAME", "Invalid agentName format");
    }
    try {
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const info = await agent.getDebugInfo();
      return successJson(c, info as Record<string, unknown>);
    } catch (error) {
      return errorJson(c, 500, "DEBUG_INFO_ERROR", unknownErrorMessage(error));
    }
  });

  // ── Session history ────────────────────────────────────────────────────────

  app.get("/api/debug/session/:agentName/history", async (c) => {
    const agentName = decodeURIComponent(c.req.param("agentName"));
    if (!validateAgentName(agentName)) {
      return errorJson(c, 400, "INVALID_AGENT_NAME", "Invalid agentName format");
    }
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 200) : 20;

    try {
      const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
      const history = (await agent.getHistory()) as Array<{
        id?: string;
        role: string;
        content: string;
      }>;
      const sliced = history.slice(-limit);
      return successJson(c, {
        agentName,
        total: history.length,
        returned: sliced.length,
        history: sliced.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: redactSensitiveContent(
            typeof msg.content === "string" && msg.content.length > 500
              ? msg.content.slice(0, 500) + `… [+${msg.content.length - 500} chars]`
              : msg.content
          )
        }))
      });
    } catch (error) {
      return errorJson(c, 500, "DEBUG_HISTORY_ERROR", unknownErrorMessage(error));
    }
  });

  // ── SSE real-time event stream ────────────────────────────────────────────
  //
  // Polls the DO's runtime snapshot every `interval` ms and pushes new events
  // via Server-Sent Events. Terminates after `maxSeconds`.
  //
  // SSE event types:
  //   open          — stream started (params echoed back)
  //   heartbeat     — emitted every poll cycle with current stateVersion
  //   runtime_event — new AgentRuntimeEvent from DO state
  //   tool_run      — latest ToolRunRecord when stateVersion advances
  //   last_error    — lastError string when stateVersion advances and error is set
  //   error         — polling error (DO unreachable etc.)
  //   close         — stream ended (max_duration_reached)
  //
  // Usage:
  //   curl -N "https://.../api/debug/session/<agentName>/stream?token=<TOKEN>"
  //   curl -N "...&interval=2000&maxSeconds=60"

  app.get("/api/debug/session/:agentName/stream", async (c) => {
    const agentName = decodeURIComponent(c.req.param("agentName"));
    if (!validateAgentName(agentName)) {
      return errorJson(c, 400, "INVALID_AGENT_NAME", "Invalid agentName format");
    }
    const intervalMs = Math.min(
      Math.max(parseInt(c.req.query("interval") ?? "1000", 10) || 1000, 500),
      10000
    );
    const maxSeconds = Math.min(
      Math.max(parseInt(c.req.query("maxSeconds") ?? "120", 10) || 120, 10),
      300
    );

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>(
      undefined,
      // Apply backpressure: limit queued bytes to ~64KB to prevent memory exhaustion
      // from slow clients holding long-lived SSE connections.
      new ByteLengthQueuingStrategy({ highWaterMark: 65536 })
    );
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const write = async (chunk: string) => {
      try {
        await writer.write(encoder.encode(chunk));
      } catch {
        // Client disconnected
      }
    };

    c.executionCtx.waitUntil((async () => {
      const seenEventIds = new Set<string>();
      let lastStateVersion = -1;
      const deadline = Date.now() + maxSeconds * 1000;
      // Bound the seen-IDs set to the last 500 entries to prevent unbounded growth
      // in long-running streams. AgentRuntimeEvent ring buffer holds MAX_RUNTIME_EVENTS=120
      // events, so 500 is well above any realistic burst.
      const MAX_SEEN_IDS = 500;

      await write(sseEvent("open", { agentName, intervalMs, maxSeconds, ts: new Date().toISOString() }));

      type RuntimeSnapshot = {
        stateVersion: number;
        events: Array<{
          id: string;
          timestamp: string;
          level: string;
          source: string;
          type: string;
          message: string;
          data?: Record<string, unknown>;
        }>;
        toolRuns: Array<{
          id: string;
          toolName: string;
          status: string;
          startedAt: string;
          finishedAt?: string;
          error?: string;
        }>;
        lastError?: string;
        retryStats: unknown;
        approvals: unknown[];
      };

      try {
        let consecutiveErrors = 0;
        while (Date.now() < deadline) {
          await new Promise<void>((r) => setTimeout(r, intervalMs));

          let snapshot: RuntimeSnapshot;
          try {
            const agent = await getAgentByName(c.env.ChatAgentV2, agentName);
            snapshot = (await agent.getRuntimeSnapshot()) as RuntimeSnapshot;
            consecutiveErrors = 0;
          } catch (err) {
            consecutiveErrors++;
            await write(sseEvent("error", {
              message: err instanceof Error ? err.message : String(err),
              consecutiveErrors,
              ts: new Date().toISOString()
            }));
            // After 5 consecutive failures, close the stream — agent likely doesn't exist
            if (consecutiveErrors >= 5) {
              await write(sseEvent("close", {
                reason: "agent_unreachable",
                consecutiveErrors,
                ts: new Date().toISOString()
              }));
              return;
            }
            continue;
          }

          // Heartbeat every poll cycle
          await write(sseEvent("heartbeat", {
            ts: new Date().toISOString(),
            stateVersion: snapshot.stateVersion
          }));

          // Push new events by id
          for (const event of snapshot.events) {
            if (!seenEventIds.has(event.id)) {
              seenEventIds.add(event.id);
              await write(sseEvent("runtime_event", event));
              // Evict oldest entries when the set exceeds the bound
              if (seenEventIds.size > MAX_SEEN_IDS) {
                const oldest = seenEventIds.values().next().value;
                if (oldest !== undefined) seenEventIds.delete(oldest);
              }
            }
          }

          // Push tool/error state when stateVersion advances
          if (snapshot.stateVersion !== lastStateVersion && lastStateVersion !== -1) {
            const latestRun = snapshot.toolRuns[snapshot.toolRuns.length - 1];
            if (latestRun) {
              await write(sseEvent("tool_run", latestRun));
            }
            if (snapshot.lastError) {
              await write(sseEvent("last_error", {
                error: snapshot.lastError,
                ts: new Date().toISOString()
              }));
            }
          }
          lastStateVersion = snapshot.stateVersion;
        }
      } finally {
        await write(sseEvent("close", {
          reason: "max_duration_reached",
          ts: new Date().toISOString()
        }));
        try { await writer.close(); } catch { /* ignore */ }
      }
    })());

    return new Response(readable as unknown as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  });

  // ── List sessions from D1 ─────────────────────────────────────────────────

  app.get("/api/debug/sessions", async (c) => {
    const userIdParam = c.req.query("userId");
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

    // userId is required — never list all users' sessions.
    if (!userIdParam) {
      return errorJson(c, 400, "MISSING_USER_ID", "userId query parameter is required");
    }

    // Validate userId format to prevent querying arbitrary users.
    // Only allow known userId patterns: hex IDs (authenticated), "user-XXXXXXXX" (guest UUID), "anon-XXXXXXXX" (IP-derived).
    const validUserId = /^[0-9a-f]{16}$/.test(userIdParam) ||
      /^user-[0-9a-f]{8}$/.test(userIdParam) ||
      /^anon-[0-9a-f]{8}$/.test(userIdParam);
    if (!validUserId) {
      return errorJson(c, 400, "INVALID_USER_ID", "Invalid userId format");
    }

    try {
      const result = await c.env.DB.prepare(
        "SELECT user_id, session_id, updated_at FROM user_session_bindings WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?"
      )
        .bind(userIdParam, limit)
        .all<{ user_id: string; session_id: string; updated_at: string }>();
      const rows: { user_id: string; session_id: string; updated_at: string }[] = result.results ?? [];

      return successJson(c, {
        total: rows.length,
        sessions: rows.map((r) => ({
          agentName: `${r.user_id}:${r.session_id}`,
          userId: r.user_id,
          sessionId: r.session_id,
          updatedAt: r.updated_at
        }))
      });
    } catch (error) {
      return errorJson(c, 500, "DEBUG_SESSIONS_ERROR", unknownErrorMessage(error));
    }
  });
}
