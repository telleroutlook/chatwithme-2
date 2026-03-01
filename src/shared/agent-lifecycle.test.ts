import { describe, expect, it, vi } from "vitest";
import {
  cancelIdleSchedules,
  destroyIfIdle,
  resolveIdleTimeoutSeconds,
  scheduleIdleDestroy
} from "./agent-lifecycle";

function createAgent(overrides: Partial<{
  schedules: Array<{ id: string; callback: string }>;
  connections: unknown[];
}> = {}) {
  const schedules = overrides.schedules ?? [];
  const connections = overrides.connections ?? [];

  return {
    getSchedules: vi.fn(() => schedules),
    cancelSchedule: vi.fn(),
    getConnections: vi.fn(() => connections),
    schedule: vi.fn(),
    destroy: vi.fn(async () => {})
  };
}

describe("agent lifecycle helpers", () => {
  it("cancels idle callbacks", () => {
    const agent = createAgent({ schedules: [{ id: "1", callback: "onIdleTimeout" }] });
    cancelIdleSchedules(agent);
    expect(agent.cancelSchedule).toHaveBeenCalledWith("1");
  });

  it("schedules idle destroy only when no active connections", () => {
    const idleAgent = createAgent({ connections: [] });
    scheduleIdleDestroy(idleAgent, { idleTimeoutSeconds: 33 });
    expect(idleAgent.schedule).toHaveBeenCalledWith(33, "onIdleTimeout", {});

    const activeAgent = createAgent({ connections: [{}] });
    scheduleIdleDestroy(activeAgent, { idleTimeoutSeconds: 33 });
    expect(activeAgent.schedule).not.toHaveBeenCalled();
  });

  it("destroys only when idle", async () => {
    const idleAgent = createAgent({ connections: [] });
    const idleResult = await destroyIfIdle(idleAgent);
    expect(idleResult).toBe(true);
    expect(idleAgent.destroy).toHaveBeenCalled();

    const activeAgent = createAgent({ connections: [{}] });
    const activeResult = await destroyIfIdle(activeAgent);
    expect(activeResult).toBe(false);
    expect(activeAgent.destroy).not.toHaveBeenCalled();
  });

  it("falls back to default timeout when env value is invalid", () => {
    expect(resolveIdleTimeoutSeconds(undefined)).toBe(900);
    expect(resolveIdleTimeoutSeconds("abc")).toBe(900);
    expect(resolveIdleTimeoutSeconds("45")).toBe(45);
  });
});
