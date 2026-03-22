/**
 * Authentication utilities for the server.
 */
import { verifyJwt } from "./jwt";

/**
 * Authentication mode indicating how the user was identified.
 */
export type AuthMode = "guest" | "authenticated";

/**
 * Source of the authentication token.
 */
export type TokenSource = "header" | "query" | "cookie" | "none";

/**
 * Extended authentication context with full auth information.
 */
export interface AuthContext {
  /** User identifier */
  userId: string;
  /** Whether user is guest or authenticated */
  authMode: AuthMode;
  /** Where the token was extracted from */
  tokenSource: TokenSource;
  /** Original token value (for debugging) */
  _token?: string;
}

interface ResolveAuthOptions {
  jwtSecret?: string | null;
}

interface TokenInfo {
  token: string;
  source: Exclude<TokenSource, "none">;
}

/**
 * Authentication error types for proper HTTP status codes.
 */
export type AuthErrorType = "token_missing" | "token_invalid_format" | "token_expired" | "token_revoked" | "user_not_found";

/**
 * Authentication error with detailed information.
 */
export class AuthError extends Error {
  constructor(
    public readonly type: AuthErrorType,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Validate simple token format (UUID for guest tokens).
 * Returns user ID derived from token, or null if invalid.
 */
export function validateSimpleToken(token: string): string | null {
  // UUID format validation
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    // Derive a stable user ID from token
    return `user-${token.slice(0, 8)}`;
  }
  return null;
}

function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

function extractToken(request: Request): TokenInfo | null {
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return { token: authHeader.slice(7), source: "header" };
  }

  // Query params: only accept guest (UUID) tokens — never JWTs.
  // WebSocket connections cannot set custom headers during handshake,
  // so guest tokens are passed via ?token=. JWTs are too sensitive
  // to place in URLs (they appear in logs, referrers, and browser history).
  const tokenParam = url.searchParams.get("token");
  if (tokenParam && !looksLikeJwt(tokenParam)) {
    return { token: tokenParam, source: "query" };
  }

  const cookie = request.headers.get("Cookie");
  if (cookie && cookie.length <= 8192) {
    const match = cookie.match(/auth_token=([^;\s]+)/);
    if (match?.[1]) {
      return { token: match[1].trim(), source: "cookie" };
    }
  }

  return null;
}

/**
 * Derive a stable but anonymous guest ID from the request IP.
 * Uses FNV-1a hash — not cryptographic, just for session isolation.
 * Different IPs get different IDs; same IP gets same ID within a Worker isolate.
 */
function deriveAnonId(request: Request): string {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `anon-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Resolve full authentication context from request.
 * Checks: 1) Authorization header, 2) URL query param, 3) Cookie
 *
 * Returns AuthContext with authMode indicating guest vs authenticated.
 */
export async function resolveAuthContext(request: Request, options: ResolveAuthOptions = {}): Promise<AuthContext> {
  const tokenInfo = extractToken(request);
  if (!tokenInfo) {
    return {
      userId: deriveAnonId(request),
      authMode: "guest",
      tokenSource: "none",
    };
  }

  const { token, source } = tokenInfo;
  const userId = validateSimpleToken(token);
  if (userId) {
    return {
      userId,
      authMode: "guest",
      tokenSource: source,
      _token: token.slice(0, 8) + "...",
    };
  }

  if (looksLikeJwt(token) && options.jwtSecret) {
    const payload = await verifyJwt(token, options.jwtSecret);
    // Require exp claim — tokens without expiry are rejected
    if (payload?.sub && payload.exp) {
      return {
        userId: payload.sub,
        authMode: "authenticated",
        tokenSource: source,
        _token: token.slice(0, 20) + "...",
      };
    }
  }

  return {
    userId: deriveAnonId(request),
    authMode: "guest",
    tokenSource: source,
  };
}

/**
 * Create an auth middleware that requires authentication.
 * Returns 401 for guest users.
 */
export async function requireAuth(request: Request, options: ResolveAuthOptions = {}): Promise<AuthContext> {
  const tokenInfo = extractToken(request);
  if (!tokenInfo) {
    throw new AuthError("token_missing", "Authentication required");
  }

  const ctx = await resolveAuthContext(request, options);
  if (ctx.authMode !== "authenticated") {
    const { token } = tokenInfo;
    if (validateSimpleToken(token)) {
      throw new AuthError("token_invalid_format", "Guest token cannot access this endpoint");
    }
    if (looksLikeJwt(token)) {
      throw new AuthError("token_expired", "Token invalid or expired");
    }
    throw new AuthError("token_invalid_format", "Invalid authentication token");
  }
  return ctx;
}

/**
 * Parse composite agent name into userId and sessionId.
 * Format: "userId:sessionId"
 */
export function parseAgentName(fullName: string): { userId: string; sessionId: string } {
  const parts = fullName.split(":");
  if (parts.length === 2) {
    return { userId: parts[0], sessionId: parts[1] };
  }
  throw new Error(`Invalid agent name format: expected "userId:sessionId", got "${fullName}"`);
}

/**
 * Build composite agent name from userId and sessionId.
 * Format: "userId:sessionId"
 */
export function buildAgentName(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

/**
 * Hash a userId for logging (privacy: don't store raw IDs in logs).
 */
function hashForLog(userId: string): string {
  // Simple FNV-1a hash for log privacy — not cryptographic
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Log auth context for observability.
 */
export function logAuthContext(
  requestId: string,
  ctx: AuthContext,
  endpoint: string
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId,
    endpoint,
    authMode: ctx.authMode,
    userHash: hashForLog(ctx.userId),
    tokenSource: ctx.tokenSource,
  }));
}
