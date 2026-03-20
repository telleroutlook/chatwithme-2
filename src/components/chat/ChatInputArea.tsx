import { type ReactNode } from "react";
import { ChatInput, type ParsedFile } from "../ChatInput";
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
  attachedFiles?: ParsedFile[];
  onFilesChange?: (files: ParsedFile[]) => void;
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
  attachedFiles,
  onFilesChange
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
        isReadOnly={isReadOnly}
        placeholder={placeholder}
        multiline={true}
        minRows={3}
        maxRows={6}
        showCharCount={true}
        attachedFiles={attachedFiles}
        onFilesChange={onFilesChange}
      />
      {bottomAddons}
    </div>
  );
}
