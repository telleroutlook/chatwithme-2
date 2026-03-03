/**
 * JWT utilities for authentication.
 * Uses Web Crypto API for Cloudflare Workers compatibility.
 */

/**
 * JWT payload structure.
 */
export interface JwtPayload {
  /** Subject (user ID) */
  sub: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Issuer */
  iss?: string;
}

/**
 * JWT header structure.
 */
interface JwtHeader {
  alg: "HS256";
  typ: "JWT";
}

/**
 * Default token expiration: 7 days in seconds.
 */
const DEFAULT_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Base64URL encode (no padding, URL-safe).
 */
function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL decode.
 */
function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0))).buffer;
}

/**
 * Import secret key for HMAC-SHA256.
 */
async function importSecretKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign a JWT token.
 */
export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  expiresInSeconds: number = DEFAULT_EXPIRATION_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    iss: "chatwithme",
  };

  const header: JwtHeader = { alg: "HS256", typ: "JWT" };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const dataToSign = `${headerB64}.${payloadB64}`;
  const key = await importSecretKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(dataToSign)
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${dataToSign}.${signatureB64}`;
}

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, null if invalid or expired.
 */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    // Verify signature
    const encoder = new TextEncoder();
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const key = await importSecretKey(secret);
    const signature = base64UrlDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(dataToVerify)
    );

    if (!isValid) {
      return null;
    }

    // Decode payload
    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as JwtPayload;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract user ID from JWT without full verification.
 * Use only for quick checks; always use verifyJwt for security.
 */
export function extractUserIdFromJwt(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadBytes = base64UrlDecode(parts[1]);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as JwtPayload;
    return payload.sub || null;
  } catch {
    return null;
  }
}

/**
 * Check if token looks like a JWT (3 base64url parts).
 */
export function isJwtFormat(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
