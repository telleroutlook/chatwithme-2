const dangerousTokens = ["delete", "remove", "drop", "write", "update", "create", "patch"];

export function requiresApprovalPolicy(toolName: string, args: Record<string, unknown>): boolean {
  const lowered = toolName.toLowerCase();
  if (dangerousTokens.some((token) => lowered.includes(token))) {
    return true;
  }

  const serialized = JSON.stringify(args);
  return serialized.length > 8000;
}

/**
 * Build a deterministic approval signature by sorting keys.
 * This ensures that the same tool+args always produce the same signature
 * regardless of object key order.
 */
export function buildApprovalSignature(
  toolName: string,
  serverId: string | undefined,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    toolName,
    serverId: serverId ?? "",
    args: sortKeysDeep(args)
  });
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}
