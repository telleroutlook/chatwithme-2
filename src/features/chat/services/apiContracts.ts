export interface ToggleServerResult {
  success: boolean;
  active?: boolean;
  error?: string;
  stateVersion?: number;
}

export interface DeleteMessageResult {
  success: boolean;
  deleted: boolean;
  error?: string;
}

export interface EditMessageResult {
  success: boolean;
  updated: boolean;
  error?: string;
}

export interface RegenerateMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

export interface DeleteSessionResult {
  success: boolean;
  destroyed: boolean;
  pendingDestroy?: boolean;
  error?: string;
}

export function isToggleServerResult(value: unknown): value is ToggleServerResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    success?: unknown;
    active?: unknown;
    error?: unknown;
    stateVersion?: unknown;
  };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.active === undefined || typeof candidate.active === "boolean") &&
    (candidate.error === undefined || typeof candidate.error === "string") &&
    (candidate.stateVersion === undefined || typeof candidate.stateVersion === "number")
  );
}

export function isDeleteMessageResult(value: unknown): value is DeleteMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    success?: unknown;
    deleted?: unknown;
    error?: unknown;
  };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.deleted === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export function isEditMessageResult(value: unknown): value is EditMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { success?: unknown; updated?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.updated === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export function isRegenerateMessageResult(value: unknown): value is RegenerateMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { success?: unknown; response?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.response === undefined || typeof candidate.response === "string") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export interface FixChartResult {
  success: boolean;
  fixedSpec?: string;
  error?: string;
}

export function isFixChartResult(value: unknown): value is FixChartResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { success?: unknown; fixedSpec?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.fixedSpec === undefined || typeof candidate.fixedSpec === "string") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export function isDeleteSessionResult(value: unknown): value is DeleteSessionResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    success?: unknown;
    destroyed?: unknown;
    pendingDestroy?: unknown;
    error?: unknown;
  };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.destroyed === "boolean" &&
    (candidate.pendingDestroy === undefined || typeof candidate.pendingDestroy === "boolean") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}
