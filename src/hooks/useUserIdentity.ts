import { nanoid } from "nanoid";
import { useState, useEffect } from "react";

const USER_ID_KEY = "chatwithme-user-id";
const AUTH_TOKEN_KEY = "chatwithme-auth-token";

/**
 * Extended user identity with clear guest/authenticated semantics.
 *
 * - isGuest: true for anonymous device identity (no real login)
 * - isAuthenticated: true ONLY after successful real authentication
 */
export interface UserIdentity {
  userId: string;
  token: string;
  /** True for anonymous device identity (local-only) */
  isGuest: boolean;
  /** True ONLY after successful login via /api/auth/login */
  isAuthenticated: boolean;
}

/**
 * Internal storage format for persisted identity.
 */
interface StoredIdentity {
  userId: string;
  token: string;
  /** Timestamp when identity was created */
  createdAt: string;
  /** Auth type: "guest" or "authenticated" */
  authType: "guest" | "authenticated";
}

/**
 * Hook for managing user identity across sessions.
 *
 * Creates a persistent anonymous user ID stored in localStorage.
 * The user ID is used to isolate chat sessions per user.
 *
 * Storage keys:
 * - chatwithme-user-id: Unique user identifier (e.g., "user-abc12345")
 * - chatwithme-auth-token: Authentication token (UUID or JWT)
 *
 * Semantics:
 * - New users start as guests (isGuest=true, isAuthenticated=false)
 * - After login, isAuthenticated becomes true
 */
export function useUserIdentity(): UserIdentity {
  const [identity, setIdentity] = useState<UserIdentity>(() => {
    // SSR guard
    if (typeof window === "undefined") {
      return {
        userId: "anonymous",
        token: "",
        isGuest: true,
        isAuthenticated: false,
      };
    }

    // Try to load existing identity
    const stored = localStorage.getItem(USER_ID_KEY);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (stored && token) {
      // Check if we have stored auth type info
      const storedJson = localStorage.getItem(`${USER_ID_KEY}-meta`);
      let authType: "guest" | "authenticated" = "guest";

      if (storedJson) {
        try {
          const meta = JSON.parse(storedJson) as StoredIdentity;
          authType = meta.authType || "guest";
        } catch {
          // Legacy format, treat as guest
        }
      }

      // Detect if token is JWT (authenticated) or UUID (guest)
      const isJwt = token.split(".").length === 3;
      const isAuthenticated = authType === "authenticated" || isJwt;

      return {
        userId: stored,
        token,
        isGuest: !isAuthenticated,
        isAuthenticated,
      };
    }

    // Create new identity for first-time users (guest mode)
    const newUserId = `user-${nanoid(8)}`;
    const newToken = crypto.randomUUID();

    try {
      localStorage.setItem(USER_ID_KEY, newUserId);
      localStorage.setItem(AUTH_TOKEN_KEY, newToken);
      localStorage.setItem(
        `${USER_ID_KEY}-meta`,
        JSON.stringify({
          userId: newUserId,
          token: newToken,
          createdAt: new Date().toISOString(),
          authType: "guest",
        } as StoredIdentity)
      );
    } catch (error) {
      console.warn("[user_identity_storage_failed]", { error });
    }

    return {
      userId: newUserId,
      token: newToken,
      isGuest: true,
      isAuthenticated: false,
    };
  });

  // Sync identity across tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === USER_ID_KEY ||
        event.key === AUTH_TOKEN_KEY ||
        event.key === `${USER_ID_KEY}-meta`
      ) {
        const stored = localStorage.getItem(USER_ID_KEY);
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const metaJson = localStorage.getItem(`${USER_ID_KEY}-meta`);

        if (stored && token) {
          let authType: "guest" | "authenticated" = "guest";
          if (metaJson) {
            try {
              const meta = JSON.parse(metaJson) as StoredIdentity;
              authType = meta.authType || "guest";
            } catch {
              // Ignore parse errors
            }
          }

          const isJwt = token.split(".").length === 3;
          const isAuthenticated = authType === "authenticated" || isJwt;

          setIdentity({
            userId: stored,
            token,
            isGuest: !isAuthenticated,
            isAuthenticated,
          });
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return identity;
}

/**
 * Update identity after successful login.
 * Upgrades guest identity to authenticated with new token.
 */
export function setAuthenticatedIdentity(
  userId: string,
  token: string
): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(
      `${USER_ID_KEY}-meta`,
      JSON.stringify({
        userId,
        token,
        createdAt: new Date().toISOString(),
        authType: "authenticated",
      } as StoredIdentity)
    );

    // Dispatch storage event to sync across tabs
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: AUTH_TOKEN_KEY,
        newValue: token,
      })
    );
  } catch (error) {
    console.warn("[set_authenticated_identity_failed]", { error });
  }
}

/**
 * Clear user identity from localStorage.
 * Useful for logout or switching accounts.
 */
export function clearUserIdentity(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(`${USER_ID_KEY}-meta`);

  // Dispatch storage event to sync across tabs
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: AUTH_TOKEN_KEY,
      newValue: null,
    })
  );
}

/**
 * Get user ID synchronously without React hook.
 * Returns "anonymous" if not set or in SSR context.
 */
export function getUserIdSync(): string {
  if (typeof window === "undefined") return "anonymous";
  return localStorage.getItem(USER_ID_KEY) || "anonymous";
}

/**
 * Get auth token synchronously without React hook.
 * Returns empty string if not set or in SSR context.
 */
export function getAuthTokenSync(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

/**
 * Check if current session is authenticated (not guest).
 */
export function isAuthenticatedSync(): boolean {
  if (typeof window === "undefined") return false;

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return false;

  // Check for JWT format
  if (token.split(".").length === 3) return true;

  // Check stored meta
  const metaJson = localStorage.getItem(`${USER_ID_KEY}-meta`);
  if (metaJson) {
    try {
      const meta = JSON.parse(metaJson) as StoredIdentity;
      return meta.authType === "authenticated";
    } catch {
      return false;
    }
  }

  return false;
}
