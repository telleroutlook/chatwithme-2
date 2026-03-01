import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@cloudflare/kumo";
import { ChatInput } from "../ChatInput";
import type { CommandSuggestionItem } from "../../types/command";
import { useI18n } from "../../hooks/useI18n";

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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("chatwithme:composer:expanded") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("chatwithme:composer:expanded", expanded ? "1" : "0");
  }, [expanded]);

  return (
    <div className="space-y-2">
      {topAddons}
      <div className="flex justify-end">
        <Button
          size="xs"
          variant="secondary"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? t("chat_input_collapse") : t("chat_input_expand")}
        >
          {expanded ? t("chat_input_collapse") : t("chat_input_expand")}
        </Button>
      </div>
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
        maxRows={expanded ? 12 : 6}
        showCharCount={true}
      />
      {bottomAddons}
    </div>
  );
}
