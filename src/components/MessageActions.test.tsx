import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MessageActions, ActionIcon } from "./MessageActions";

describe("MessageActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render copy button by default", () => {
    render(<MessageActions content="Test content" />);

    // The button should exist (even if hidden via opacity)
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("should copy content to clipboard when copy button is clicked", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<MessageActions content="Test content" showCopy={true} />);

    const copyButton = screen.getByLabelText("Copy message");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Test content");
    });
  });

  it("should show regenerate button when showRegenerate is true", () => {
    const onRegenerate = vi.fn();
    render(<MessageActions content="Test" showRegenerate={true} onRegenerate={onRegenerate} />);

    const regenerateButton = screen.getByLabelText("Regenerate response");
    expect(regenerateButton).toBeInTheDocument();
  });

  it("should call onRegenerate when regenerate button is clicked", () => {
    const onRegenerate = vi.fn();
    render(<MessageActions content="Test" showRegenerate={true} onRegenerate={onRegenerate} />);

    const regenerateButton = screen.getByLabelText("Regenerate response");
    fireEvent.click(regenerateButton);

    expect(onRegenerate).toHaveBeenCalled();
  });

  it("should show delete button when showDelete is true", () => {
    const onDelete = vi.fn();
    render(<MessageActions content="Test" showDelete={true} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText("Delete message");
    expect(deleteButton).toBeInTheDocument();
  });

  it("should call onDelete when delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<MessageActions content="Test" showDelete={true} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText("Delete message");
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalled();
  });

  it("should disable buttons when disabled prop is true", () => {
    const onRegenerate = vi.fn();
    render(
      <MessageActions
        content="Test"
        showRegenerate={true}
        onRegenerate={onRegenerate}
        disabled={true}
      />
    );

    const regenerateButton = screen.getByLabelText("Regenerate response");
    fireEvent.click(regenerateButton);

    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("should show edit button when showEdit is true", () => {
    const onEdit = vi.fn();
    render(<MessageActions content="Test" showEdit={true} onEdit={onEdit} />);

    const editButton = screen.getByLabelText("Edit message");
    expect(editButton).toBeInTheDocument();
  });
});

describe("ActionIcon", () => {
  it("should render icon", () => {
    render(<ActionIcon icon={<span data-testid="test-icon">Icon</span>} title="Test Icon" />);

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("should call onClick when clicked", () => {
    const onClick = vi.fn();
    render(<ActionIcon icon={<span>Icon</span>} onClick={onClick} title="Test Icon" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  it("should be disabled when disabled prop is true", () => {
    const onClick = vi.fn();
    render(
      <ActionIcon icon={<span>Icon</span>} onClick={onClick} disabled={true} title="Test Icon" />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
