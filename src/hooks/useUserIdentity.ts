import { nanoid } from "nanoid";
import { useState, useEffect } from "react";

const USER_ID_KEY = "chatwithme-user-id";
const AUTH_TOKEN_KEY = "chatwithme-auth-token";

export interface UserIdentity {
  userId: string;
  token: string;
  isAuthenticated: boolean;
}

/**
 * Hook for managing user identity across sessions.
 *
 * Creates a persistent anonymous user ID stored in localStorage.
 * The user ID is used to isolate chat sessions per user.
 *
 * Storage:
 * - chatwithme-user-id: Unique user identifier (e.g., "user-abc12345")
 * - chatwithme-auth-token: Authentication token (UUID)
 */
export function useUserIdentity(): UserIdentity {
  const [identity, setIdentity] = useState<UserIdentity>(() => {
    // SSR guard
    if (typeof window === "undefined") {
      return { userId: "anonymous", token: "", isAuthenticated: false };
    }

    // Try to load existing identity
    const stored = localStorage.getItem(USER_ID_KEY);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (stored && token) {
      return { userId: stored, token, isAuthenticated: true };
    }

    // Create new identity for first-time users
    const newUserId = `user-${nanoid(8)}`;
    const newToken = crypto.randomUUID();

    try {
      localStorage.setItem(USER_ID_KEY, newUserId);
      localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    } catch (error) {
      console.warn("[user_identity_storage_failed]", { error });
    }

    return { userId: newUserId, token: newToken, isAuthenticated: true };
  });

  // Sync identity across tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === USER_ID_KEY || event.key === AUTH_TOKEN_KEY) {
        const stored = localStorage.getItem(USER_ID_KEY);
        const token = localStorage.getItem(AUTH_TOKEN_KEY);

        if (stored && token) {
          setIdentity({ userId: stored, token, isAuthenticated: true });
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return identity;
}

/**
 * Clear user identity from localStorage.
 * Useful for logout or switching accounts.
 */
export function clearUserIdentity(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
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
