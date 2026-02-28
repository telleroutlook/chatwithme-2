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
  placeholder: string;
  commandSuggestions: CommandSuggestionItem[];
  topAddons?: ReactNode;
  bottomAddons?: ReactNode;
}

export function ChatInputArea({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  isConnected,
  placeholder,
  commandSuggestions,
  topAddons,
  bottomAddons
}: ChatInputAreaProps) {
  return (
    <div className="space-y-2">
      {topAddons}
      <ChatInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onStop={onStop}
        commandSuggestions={commandSuggestions}
        isStreaming={isStreaming}
        isConnected={isConnected}
        placeholder={placeholder}
        multiline={true}
        maxRows={6}
        showCharCount={true}
      />
      {bottomAddons}
    </div>
  );
}
