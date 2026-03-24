import { getAuthTokenSync } from "../../../hooks/useUserIdentity";

interface ApiErrorPayload {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface ApiSuccessPayload {
  success: true;
  requestId?: string;
  authMode?: "guest" | "authenticated";
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const candidate = payload as ApiErrorPayload;
  return candidate.error?.message || fallback;
}

/**
 * Call API with automatic Authorization header injection.
 * Merges custom headers with default auth header when token is available.
 */
export async function callApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiSuccessPayload & T> {
  const token = getAuthTokenSync();

  // Build headers with automatic auth injection
  const headers = new Headers(init?.headers);

  // Inject Authorization header if token exists and not already set
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Apply a default 30s timeout to all API calls to prevent indefinitely hanging requests.
  // Callers can override by passing their own AbortSignal via init.signal.
  const timeoutSignal = AbortSignal.timeout(30_000);
  const signal = init?.signal
    ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any
      ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([init.signal, timeoutSignal])
      : init.signal
    : timeoutSignal;

  const response = await fetch(input, {
    ...init,
    headers,
    signal,
  });
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `HTTP ${response.status}`));
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid API response");
  }

  const candidate = payload as { success?: unknown };
  if (candidate.success !== true) {
    throw new Error(toErrorMessage(payload, "Request failed"));
  }

  return payload as ApiSuccessPayload & T;
}
