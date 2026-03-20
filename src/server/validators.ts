/**
 * Validation utilities for the server.
 */

import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { errorJson } from "./http";

/**
 * Resolve and normalize a session ID from input.
 */
export function resolveSessionId(input: { sessionId: string }): string {
  return input.sessionId.trim();
}

/**
 * Parse and validate a comma-separated list of session IDs.
 * Returns up to 120 valid session IDs.
 */
export function parseSessionIds(raw: string | undefined): string[] {
  if (!raw || raw.length > 50000) return [];
  const ids = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 120);
  return ids.filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id));
}

/**
 * Create a JSON body validator middleware.
 */
export const validateJson = (schema: z.ZodTypeAny) =>
  zValidator("json", schema, (result, c) => {
    if (result.success) return;
    return errorJson(c, 400, "VALIDATION_ERROR", result.error.message);
  });

/**
 * Create a query parameter validator middleware.
 */
export const validateQuery = (schema: z.ZodTypeAny) =>
  zValidator("query", schema, (result, c) => {
    if (result.success) return;
    return errorJson(c, 400, "VALIDATION_ERROR", result.error.message);
  });
