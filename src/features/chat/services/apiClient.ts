interface ApiErrorPayload {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface ApiSuccessPayload<T> {
  success: true;
  requestId?: string;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const candidate = payload as ApiErrorPayload;
  return candidate.error?.message || fallback;
}

export async function callApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiSuccessPayload<T> & T> {
  const response = await fetch(input, init);
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

  return payload as ApiSuccessPayload<T> & T;
}
