import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolCallCard, extractToolCalls } from "./ToolCallCard";

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

  it("ignores empty approvalId", () => {
    const parts = [
      {
        type: "tool-browser.search",
        toolCallId: "   ",
        state: "approval-requested"
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBeUndefined();
  });

  it("ignores malformed approvalId from error text", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolName: "browser.search",
        state: "approval-requested",
        errorText: "requires approval (id: bad*id)."
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBeUndefined();
  });

  it("ignores overlong approvalId in error text", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolName: "browser.search",
        state: "approval-requested",
        errorText: `requires approval (id: ${"a".repeat(65)}).`
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBeUndefined();
  });

  it("handles nested parenthesis in error text safely", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolName: "browser.search",
        state: "approval-requested",
        errorText: "requires approval (id: approval-4(extra))."
      }
    ];

    const toolCalls = extractToolCalls(parts);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.approvalId).toBeUndefined();
  });
});

describe("ToolCallCard", () => {
  it("disables approval buttons when canApprove is false", () => {
    render(
      <ToolCallCard
        toolName="browser.search"
        state="approval-requested"
        approvalId="approval-1"
        canApprove={false}
        approvalBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("disables approval buttons when approval is busy", () => {
    render(
      <ToolCallCard
        toolName="browser.search"
        state="approval-requested"
        approvalId="approval-1"
        canApprove={true}
        approvalBusy={true}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("fires approve and reject handlers when enabled", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <ToolCallCard
        toolName="browser.search"
        state="approval-requested"
        approvalId="approval-1"
        canApprove={true}
        approvalBusy={false}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onApprove).toHaveBeenCalledWith("approval-1");
    expect(onReject).toHaveBeenCalledWith("approval-1");
  });

  it("shows a validation hint when approvalId is invalid", () => {
    render(
      <ToolCallCard
        toolName="browser.search"
        state="approval-requested"
        canApprove={false}
        approvalBusy={false}
      />
    );

    expect(
      screen.getByText("Approval request is invalid: missing or malformed approval ID.")
    ).toBeInTheDocument();
  });
});
