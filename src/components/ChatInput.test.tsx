import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput, SimpleChatInput } from "./ChatInput";

describe("ChatInput", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isConnected: true,
    isStreaming: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render input with placeholder", () => {
    render(<ChatInput {...defaultProps} placeholder="Type a message..." />);

    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });

  it("should call onChange when input value changes", async () => {
    const onChange = vi.fn();
    render(<ChatInput {...defaultProps} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Hello");

    expect(onChange).toHaveBeenCalled();
  });

  it("should call onSubmit when Enter is pressed", async () => {
    const onSubmit = vi.fn();
    render(<ChatInput {...defaultProps} onSubmit={onSubmit} value="Hello" />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onSubmit).toHaveBeenCalled();
  });

  it("should not submit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    render(<ChatInput {...defaultProps} onSubmit={onSubmit} value="Hello" />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should not submit when input is empty", async () => {
    const onSubmit = vi.fn();
    render(<ChatInput {...defaultProps} onSubmit={onSubmit} value="" />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should show stop button when streaming", () => {
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps} isStreaming={true} onStop={onStop} />);

    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("should call onStop when stop button is clicked", () => {
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps} isStreaming={true} onStop={onStop} />);

    const stopButton = screen.getByText("Stop");
    fireEvent.click(stopButton);

    expect(onStop).toHaveBeenCalled();
  });

  it("should show send button when not streaming", () => {
    render(<ChatInput {...defaultProps} isStreaming={false} />);

    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("should disable input when not connected", () => {
    render(<ChatInput {...defaultProps} isConnected={false} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("should disable input and send in readonly mode", () => {
    const onSubmit = vi.fn();
    render(
      <ChatInput
        {...defaultProps}
        isReadOnly={true}
        value="readonly message"
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(screen.getByPlaceholderText("Read-only mode")).toBeInTheDocument();

    const sendButton = screen.getByLabelText("Send");
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should show character count when showCharCount is true", () => {
    render(<ChatInput {...defaultProps} value="Hello" showCharCount={true} />);

    // Focus the input to show the character count
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    expect(screen.getByText("5/4000")).toBeInTheDocument();
  });

  it("should not show clear button when input is empty", () => {
    render(<ChatInput {...defaultProps} value="" />);

    // Clear button only appears when there's content
    const clearButton = screen.queryByLabelText("Clear input");
    expect(clearButton).not.toBeInTheDocument();
  });
});

describe("SimpleChatInput", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isConnected: true,
    isStreaming: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render input", () => {
    render(<SimpleChatInput {...defaultProps} placeholder="Type..." />);

    expect(screen.getByPlaceholderText("Type...")).toBeInTheDocument();
  });

  it("should call onSubmit on Enter", () => {
    const onSubmit = vi.fn();
    render(<SimpleChatInput {...defaultProps} onSubmit={onSubmit} value="Test" />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onSubmit).toHaveBeenCalled();
  });

  it("should show stop button when streaming", () => {
    const onStop = vi.fn();
    render(<SimpleChatInput {...defaultProps} isStreaming={true} onStop={onStop} />);

    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("should disable simple input in readonly mode", () => {
    const onSubmit = vi.fn();
    render(<SimpleChatInput {...defaultProps} isReadOnly={true} value="readonly" onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(screen.getByPlaceholderText("Read-only mode")).toBeInTheDocument();

    const sendButton = screen.getByLabelText("Send");
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
