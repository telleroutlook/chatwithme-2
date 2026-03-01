const DEFAULT_IDLE_TIMEOUT_SECONDS = 15 * 60;
const IDLE_CALLBACK = "onIdleTimeout";

interface SchedulableAgent {
  getSchedules: () => Iterable<{ id: string; callback: string } | { id: string; callback?: string }>;
  cancelSchedule: (id: string) => unknown;
  getConnections: () => Iterable<unknown>;
  schedule: (...args: unknown[]) => unknown;
  destroy: () => Promise<void>;
}

export interface LifecycleConfig {
  idleTimeoutSeconds?: number;
}

export function cancelIdleSchedules(
  agent: SchedulableAgent,
  callbackName = IDLE_CALLBACK
): void {
  for (const schedule of agent.getSchedules()) {
    if (schedule.callback === callbackName) {
      agent.cancelSchedule(schedule.id);
    }
  }
}

export function scheduleIdleDestroy(
  agent: SchedulableAgent,
  config: LifecycleConfig = {}
): void {
  const remaining = [...agent.getConnections()].length;
  if (remaining > 0) {
    return;
  }

  const timeoutSeconds = config.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS;
  agent.schedule(timeoutSeconds, IDLE_CALLBACK as never, {});
}

export async function destroyIfIdle(agent: SchedulableAgent): Promise<boolean> {
  const remaining = [...agent.getConnections()].length;
  if (remaining > 0) {
    return false;
  }
  await agent.destroy();
  return true;
}

export function resolveIdleTimeoutSeconds(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IDLE_TIMEOUT_SECONDS;
  }
  return parsed;
}

export const AGENT_IDLE_CALLBACK = IDLE_CALLBACK;
export const AGENT_DEFAULT_IDLE_TIMEOUT_SECONDS = DEFAULT_IDLE_TIMEOUT_SECONDS;
