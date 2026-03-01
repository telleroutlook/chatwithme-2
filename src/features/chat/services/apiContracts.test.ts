import { describe, expect, it } from "vitest";
import { isDeleteSessionResult } from "./apiContracts";

describe("isDeleteSessionResult", () => {
  it("accepts valid result payload", () => {
    expect(
      isDeleteSessionResult({
        success: true,
        destroyed: false,
        pendingDestroy: true
      })
    ).toBe(true);
  });

  it("rejects invalid result payload", () => {
    expect(
      isDeleteSessionResult({
        success: true,
        destroyed: "no"
      })
    ).toBe(false);
  });
});
