import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

function requestIdFromContext(c: Context): string {
  return c.get("requestId") || crypto.randomUUID();
}

export function successJson<T extends Record<string, unknown>>(
  c: Context,
  payload: T,
  status: ContentfulStatusCode = 200
) {
  return c.json(
    {
      ...payload,
      success: true,
      requestId: requestIdFromContext(c)
    },
    status
  );
}

export function errorJson(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string
) {
  return c.json(
    {
      success: false,
      error: {
        code,
        message
      },
      requestId: requestIdFromContext(c)
    } satisfies ApiErrorBody,
    status
  );
}

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
