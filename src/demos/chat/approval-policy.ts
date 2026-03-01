const dangerousTokens = ["delete", "remove", "drop", "write", "update", "create", "patch"];

export function requiresApprovalPolicy(toolName: string, args: Record<string, unknown>): boolean {
  const lowered = toolName.toLowerCase();
  if (dangerousTokens.some((token) => lowered.includes(token))) {
    return true;
  }

  const serialized = JSON.stringify(args);
  return serialized.length > 8000;
}

export function buildApprovalSignature(
  toolName: string,
  serverId: string | undefined,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    toolName,
    serverId: serverId ?? "",
    args
  });
}
