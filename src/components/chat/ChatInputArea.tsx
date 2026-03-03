import { type ReactNode } from "react";
import { ChatInput } from "../ChatInput";
import type { CommandSuggestionItem } from "../../types/command";

interface ChatInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  isConnected: boolean;
  isReadOnly?: boolean;
  placeholder: string;
  commandSuggestions: CommandSuggestionItem[];
  topAddons?: ReactNode;
  bottomAddons?: ReactNode;
  /** Whether the virtual keyboard is visible */
  keyboardVisible?: boolean;
  /** Visual viewport offset from top (for keyboard-aware positioning) */
  viewportOffsetTop?: number;
}

export function ChatInputArea({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  isConnected,
  isReadOnly = false,
  placeholder,
  commandSuggestions,
  topAddons,
  bottomAddons,
  keyboardVisible = false,
  viewportOffsetTop = 0
}: ChatInputAreaProps) {
  // Dynamic styles for keyboard-aware positioning
  const containerStyle = keyboardVisible
    ? {
        transform: `translateY(-${viewportOffsetTop}px)`,
        transition: "transform 0.15s ease-out"
      }
    : undefined;

  return (
    <div className="space-y-2" style={containerStyle}>
      {topAddons}
      <ChatInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onStop={onStop}
        commandSuggestions={commandSuggestions}
        isStreaming={isStreaming}
        isConnected={isConnected}
        isReadOnly={isReadOnly}
        placeholder={placeholder}
        multiline={true}
        minRows={3}
        maxRows={6}
        showCharCount={true}
      />
      {bottomAddons}
    </div>
  );
}
