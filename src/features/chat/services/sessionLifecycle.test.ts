import { describe, expect, it } from "vitest";
import { buildSessionViewResetState } from "./sessionLifecycle";

describe("buildSessionViewResetState", () => {
  it("builds editable defaults in normal mode", () => {
    const result = buildSessionViewResetState(false);
    expect(result.connectionStatus).toBe("connecting");
    expect(result.permissions).toEqual({ canEdit: true, readonly: false });
    expect(result.isLoading).toBe(true);
    expect(result.pendingApprovals).toEqual([]);
    expect(result.liveProgress).toEqual([]);
  });

  it("builds readonly defaults in view mode", () => {
    const result = buildSessionViewResetState(true);
    expect(result.permissions).toEqual({ canEdit: false, readonly: true });
  });

  it("returns fresh array instances for mutable lists", () => {
    const a = buildSessionViewResetState(false);
    const b = buildSessionViewResetState(false);
    expect(a.pendingApprovals).not.toBe(b.pendingApprovals);
    expect(a.liveProgress).not.toBe(b.liveProgress);
  });
});
