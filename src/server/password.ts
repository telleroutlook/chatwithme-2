/**
 * Password hashing utilities using Web Crypto API.
 * Uses PBKDF2 with SHA-256 for Cloudflare Workers compatibility.
 */

const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Generate a random salt.
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Convert Uint8Array to hex string.
 */
function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

 /**
 * Convert hex string to Uint8Array.
 */
function hexToBuffer(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

 /**
 * Hash a password with a random salt.
 * Returns format: "iterations:salt:hash" (all hex)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const saltSource = Uint8Array.from(salt);
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltSource,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    passwordKey,
    KEY_LENGTH * 8
  );

  return `${ITERATIONS}:${bufferToHex(salt)}:${bufferToHex(new Uint8Array(hashBuffer))}`;
    }

/**
 * Verify a password against a stored hash.
 * Stored hash format: "iterations:salt:hash"
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 3) {
    return false;
  }
  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);

  if (isNaN(iterations) || iterations <= 0) {
    return false;
  }

  try {
    const salt = hexToBuffer(saltHex);
    const saltSource = Uint8Array.from(salt);
    const expectedHash = hexToBuffer(hashHex);

    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const actualHash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltSource,
        iterations,
        hash: "SHA-256"
      },
      passwordKey,
      KEY_LENGTH * 8
    );

    // Constant-time comparison
    if (actualHash.byteLength !== expectedHash.byteLength) {
      return false;
    }

    const actual = new Uint8Array(actualHash);
    const expected = new Uint8Array(expectedHash);
    let result = 0;
    for (let i = 0; i < actual.length; i++) {
      result |= actual[i] ^ expected[i];
    }

    return result === 0;
  } catch {
    return false;
  }
}
