/**
 * Authentication context for managing user login state.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { callApi } from "../services/apiClient";
import {
  setAuthenticatedIdentity,
  clearUserIdentity,
  isAuthenticatedSync,
} from "../../../hooks/useUserIdentity";

// ============ Types ============

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthState {
  /** Current logged-in user, null if not authenticated */
  user: User | null;
  /** Whether authentication check is in progress */
  isLoading: boolean;
  /** Whether user is authenticated (logged in) */
  isAuthenticated: boolean;
  /** Whether user is in guest mode (not logged in) */
  isGuest: boolean;
  /** Last error message */
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  /** Login with username and password */
  login: (username: string, password: string) => Promise<void>;
  /** Register new account */
  register: (username: string, password: string) => Promise<void>;
  /** Logout current user */
  logout: () => Promise<void>;
  /** Clear any error */
  clearError: () => void;
  /** Refresh authentication state */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ============ Provider Component ============

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isGuest: true,
    error: null,
  });

  /**
   * Check current authentication status.
   */
  const checkAuth = useCallback(async () => {
    try {
      const result = await callApi<{ authenticated: boolean; user?: User }>(
        "/api/auth/me"
      );

      if (result.authenticated && result.user) {
        setState({
          user: result.user,
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          error: null,
        });
      } else {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isGuest: true,
          error: null,
        });
      }
    } catch {
      // Not authenticated or error
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        isGuest: true,
        error: null,
      });
    }
  }, []);

  /**
   * Login with credentials.
   */
  const login = useCallback(
    async (username: string, password: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await callApi<{ token: string; user: User }>(
          "/api/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          }
        );

        // Update stored identity with new token
        setAuthenticatedIdentity(result.user.id, result.token);

        setState({
          user: result.user,
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          error: null,
        });

        // Trigger session sync after login
        window.dispatchEvent(new CustomEvent("auth:login"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Login failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Register new account.
   */
  const register = useCallback(
    async (username: string, password: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await callApi<{ token: string; user: User }>(
          "/api/auth/register",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          }
        );

        // Update stored identity with new token
        setAuthenticatedIdentity(result.user.id, result.token);

        setState({
          user: result.user,
          isLoading: false,
          isAuthenticated: true,
          isGuest: false,
          error: null,
        });

        // Trigger session sync after registration
        window.dispatchEvent(new CustomEvent("auth:login"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Registration failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Logout current user.
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await callApi("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    }

    // Clear stored identity
    clearUserIdentity();

    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isGuest: true,
      error: null,
    });

    // Trigger session clear after logout
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }, []);

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Refresh authentication state.
   */
  const refresh = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    clearError,
    refresh,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ============ Hook ============

/**
 * Hook to access authentication context.
 * Must be used within AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Optional hook that returns null if not in provider.
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
