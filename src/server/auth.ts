/**
 * Authentication utilities for the server.
 */

/**
 * Authentication result from middleware
 */
export interface AuthResult {
  userId: string;
}

/**
 * Validate simple token format.
 * Token should be a UUID format string.
 * Returns user ID derived from token, or "anonymous" if invalid.
 */
export function validateSimpleToken(token: string): string {
  // UUID format validation
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    // Derive a stable user ID from token
    return `user-${token.slice(0, 8)}`;
  }
  return "anonymous";
}

/**
 * Extract authentication info from request.
 * Checks: 1) Authorization header, 2) URL query param, 3) Cookie
 */
export function authMiddleware(request: Request): AuthResult {
  const url = new URL(request.url);

  // 1. Try Authorization header (Bearer token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const userId = validateSimpleToken(token);
    if (userId !== "anonymous") {
      return { userId };
    }
  }

  // 2. Try URL query parameter (for WebSocket connections)
  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    const userId = validateSimpleToken(tokenParam);
    if (userId !== "anonymous") {
      return { userId };
    }
  }

  // 3. Try Cookie
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/);
    if (match?.[1]) {
      const userId = validateSimpleToken(match[1]);
      if (userId !== "anonymous") {
        return { userId };
      }
    }
  }

  // Default to anonymous user
  return { userId: "anonymous" };
}

/**
 * Parse composite agent name into userId and sessionId.
 * Format: "userId:sessionId" or legacy "sessionId"
 */
export function parseAgentName(fullName: string): { userId: string; sessionId: string } {
  const parts = fullName.split(":");
  if (parts.length === 2) {
    return { userId: parts[0], sessionId: parts[1] };
  }
  // Backward compatibility: treat as legacy sessionId
  return { userId: "legacy", sessionId: fullName };
}

/**
 * Build composite agent name from userId and sessionId.
 * Format: "userId:sessionId"
 */
export function buildAgentName(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}
