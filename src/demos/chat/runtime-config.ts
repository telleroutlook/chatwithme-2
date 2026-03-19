export function parseBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function getModelStreamEnabled(env: Env): boolean {
  return parseBooleanEnv(env.CHAT_MODEL_STREAM, true);
}

export function getThinkingEnabled(env: Env): boolean {
  return parseBooleanEnv(env.CHAT_ENABLE_THINKING, false);
}

export function getThinkingType(env: Env): "enabled" | "disabled" {
  const explicit = env.CHAT_MODEL_THINKING?.toLowerCase();
  if (explicit === "enabled" || explicit === "disabled") {
    return explicit;
  }
  return getThinkingEnabled(env) ? "enabled" : "disabled";
}

export function getModelId(env: Env): string {
  return env.CHAT_MODEL_ID || "GLM-4.7";
}

export function getMaxOutputTokens(env: Env): number | undefined {
  const raw = env.CHAT_MODEL_MAX_TOKENS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getToolTimeoutMs(env: Env): number {
  const raw = env.CHAT_TOOL_TIMEOUT_MS;
  if (!raw) return 25000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25000;
}

export function getToolMaxAttempts(env: Env): number {
  const raw = env.CHAT_TOOL_MAX_ATTEMPTS;
  if (!raw) return 2;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

export function getModelTemperature(env: Env): number {
  const raw = env.CHAT_MODEL_TEMPERATURE;
  if (!raw) return 0.5;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : 0.5;
}

export function getMaxToolSteps(env: Env): number {
  const raw = env.CHAT_MAX_TOOL_STEPS;
  if (!raw) return 4;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 4;
}

export type ChartPrimaryType = "adc" | "g2";

export function getChartPrimary(env: Env): ChartPrimaryType {
  const raw = env.CHAT_CHART_PRIMARY?.toLowerCase();
  if (raw === "adc" || raw === "g2") {
    return raw;
  }
  return "adc"; // Default to ADC
}
