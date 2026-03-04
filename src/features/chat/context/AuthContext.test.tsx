import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { callApi } from "../services/apiClient";
import { clearUserIdentity, getUserIdSync, setAuthenticatedIdentity } from "../../../hooks/useUserIdentity";

vi.mock("../services/apiClient", () => ({
  callApi: vi.fn()
}));

vi.mock("../../../hooks/useUserIdentity", () => ({
  setAuthenticatedIdentity: vi.fn(),
  clearUserIdentity: vi.fn(),
  getUserIdSync: vi.fn(() => "guest-user")
}));

const mockedCallApi = vi.mocked(callApi);
const mockedSetAuthenticatedIdentity = vi.mocked(setAuthenticatedIdentity);
const mockedClearUserIdentity = vi.mocked(clearUserIdentity);
const mockedGetUserIdSync = vi.mocked(getUserIdSync);

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function asApiResult(value: unknown): Awaited<ReturnType<typeof callApi>> {
  return value as Awaited<ReturnType<typeof callApi>>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCallApi.mockRejectedValue(new Error("not authenticated"));
    mockedGetUserIdSync.mockReturnValue("guest-user");
  });

  it("dispatches auth:login with migration detail after login", async () => {
    mockedCallApi
      .mockRejectedValueOnce(new Error("not authenticated"))
      .mockResolvedValueOnce(asApiResult({
        success: true,
        token: "jwt.token.value",
        user: {
          id: "user-1",
          username: "alice",
          createdAt: "2026-03-01T00:00:00.000Z"
        }
      }));

    const eventHandler = vi.fn();
    window.addEventListener("auth:login", eventHandler as EventListener);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("alice", "password123");
    });

    expect(mockedSetAuthenticatedIdentity).toHaveBeenCalledWith("user-1", "jwt.token.value");
    expect(eventHandler).toHaveBeenCalledTimes(1);
    const event = eventHandler.mock.calls[0][0] as CustomEvent<{ fromUserId: string; toUserId: string }>;
    expect(event.detail).toEqual({ fromUserId: "guest-user", toUserId: "user-1" });

    window.removeEventListener("auth:login", eventHandler as EventListener);
  });

  it("calls change-password endpoint", async () => {
    mockedCallApi
      .mockRejectedValueOnce(new Error("not authenticated"))
      .mockResolvedValueOnce(asApiResult({ success: true, message: "Password changed successfully" }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.changePassword("old-pass-123", "new-pass-456");
    });

    expect(mockedCallApi).toHaveBeenCalledWith("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "old-pass-123",
        newPassword: "new-pass-456"
      })
    });
  });

  it("clears identity on logout", async () => {
    mockedCallApi
      .mockRejectedValueOnce(new Error("not authenticated"))
      .mockResolvedValueOnce(asApiResult({ success: true, message: "Logout successful" }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockedClearUserIdentity).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});
