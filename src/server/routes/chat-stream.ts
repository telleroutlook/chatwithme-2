/**
 * POST /api/chat/stream — SSE streaming endpoint for external integrations.
 *
 * Unlike /api/chat (Durable Object @callable, 55s timeout), this route calls
 * the model directly and streams tokens as Server-Sent Events.
 *
 * SSE event format:
 *   data: {"type":"delta","text":"..."}    — token chunk
 *   data: {"type":"done"}                  — stream complete
 *   data: {"type":"error","message":"..."}  — error
 */

import { Hono } from "hono";
import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resolveAuthContext } from "../auth";
import { getModelId, getMaxOutputTokens, getThinkingType, getModelTemperature } from "../../demos/chat/runtime-config";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };

export function registerChatStreamRoute(app: Hono<AppBindings>): void {
  app.post("/api/chat/stream", async (c) => {
    // Parse body manually to avoid middleware conflicts
    let message: string;
    let sessionId: string;
    try {
      const body = await c.req.json() as { message?: unknown; sessionId?: unknown };
      if (typeof body.message !== "string" || !body.message.trim()) {
        return c.json({ success: false, error: { code: "INVALID_BODY", message: "message is required" } }, 400);
      }
      if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
        return c.json({ success: false, error: { code: "INVALID_BODY", message: "sessionId is required" } }, 400);
      }
      message = body.message.trim();
      sessionId = body.sessionId.trim();
    } catch {
      return c.json({ success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } }, 400);
    }

    await resolveAuthContext(c.req.raw, { jwtSecret: c.env.AUTH_JWT_SECRET });

    const glm = createOpenAICompatible({
      name: "glm",
      baseURL: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: c.env.BIGMODEL_API_KEY,
    });

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const send = (obj: Record<string, unknown>): void => {
      writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    };

    // Fire-and-forget: stream model output, close writer when done
    void (async () => {
      try {
        const result = streamText({
          model: glm(getModelId(c.env)),
          system: "You are a helpful assistant. Answer in the same language as the user.",
          messages: [{ role: "user", content: message }],
          temperature: getModelTemperature(c.env),
          ...(getMaxOutputTokens(c.env) ? { maxOutputTokens: getMaxOutputTokens(c.env) } : {}),
          providerOptions: {
            glm: { thinking: { type: getThinkingType(c.env) }, tool_stream: true }
          },
        });

        for await (const chunk of result.textStream) {
          const clean = chunk.replace(/<\/?think>/gi, "");
          if (clean) send({ type: "delta", text: clean });
        }
        send({ type: "done", sessionId });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        writer.close();
      }
    })();

    const origin = c.req.header("Origin");
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        ...(origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } : {}),
      },
    });
  });
}
