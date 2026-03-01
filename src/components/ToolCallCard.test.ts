import { describe, expect, it } from "vitest";
import { extractToolCalls } from "./ToolCallCard";

describe("extractToolCalls", () => {
  it("extracts approvalId from toolCallId first", () => {
    const parts = [
      {
        type: "tool-browser.search",
        toolCallId: "approval-1",
        state: "approval-requested",
        input: { q: "hello" }
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBe("approval-1");
  });

  it("extracts approvalId from output when toolCallId is missing", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolName: "browser.search",
        state: "approval-requested",
        output: { approvalId: "approval-2" }
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBe("approval-2");
  });

  it("extracts approvalId from error text as fallback", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolName: "browser.search",
        state: "approval-requested",
        errorText: 'Tool "browser.search" requires approval (id: approval-3).'
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBe("approval-3");
  });
});
