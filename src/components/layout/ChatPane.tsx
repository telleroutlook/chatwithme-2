import { useEffect, useRef, useState } from "react";
import { Badge, Surface, Text } from "@cloudflare/kumo";
import type { UIMessage } from "ai";
import type { CommandSuggestionItem } from "../../types/command";
import { ChatInputArea, ChatMessageList, BackToBottom } from "../chat";

interface ProgressEntry {
  id: string;
  timestamp: string;
  phase: string;
  message: string;
  status: "start" | "success" | "error" | "info";
  toolName?: string;
  snippet?: string;
}

interface ChatPaneProps {
  messages: UIMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  activeToolsCount: number;
  awaitingFirstAssistant: boolean;
  liveProgress: ProgressEntry[];
  phaseLabels: Record<string, string>;
  input: string;
  setInput: (value: string) => void;
  commandSuggestions: CommandSuggestionItem[];
  onSend: () => void;
  onStop: () => void;
  onDeleteMessage: (messageId: UIMessage["id"]) => void;
  onEditMessage: (messageId: UIMessage["id"], content: string) => Promise<void>;
  onRegenerateMessage: (messageId: UIMessage["id"]) => Promise<void>;
  onForkMessage: (messageId: UIMessage["id"]) => Promise<void>;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
  getMessageText: (message: UIMessage) => string;
}

export function ChatPane({
  messages,
  isStreaming,
  isConnected,
  activeToolsCount,
  awaitingFirstAssistant,
  liveProgress,
  phaseLabels,
  input,
  setInput,
  commandSuggestions,
  onSend,
  onStop,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
  onForkMessage,
  t,
  getMessageText
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBackToBottom, setShowBackToBottom] = useState(false);

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    if (isNearBottom()) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const shouldShow = el.scrollHeight - el.scrollTop - el.clientHeight > 180;
    setShowBackToBottom(shouldShow);
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      {awaitingFirstAssistant && (
        <div className="px-3 pt-3 sm:px-5">
          <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Text size="sm" bold>
                {t("live_feed_title")}
              </Text>
              <Badge variant="secondary">{liveProgress.length}</Badge>
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {liveProgress.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-kumo-line/70 bg-kumo-base/65 px-2.5 py-1.5"
                  title={`${phaseLabels[entry.phase]}${entry.toolName ? ` · ${entry.toolName}` : ""} | ${entry.message}${entry.snippet ? ` | ${entry.snippet}` : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">
                      <Text size="xs" bold>
                        {phaseLabels[entry.phase]}
                        {entry.toolName ? ` · ${entry.toolName}` : ""}
                      </Text>
                    </span>
                    <span className="truncate">
                      <Text size="xs">{entry.message}</Text>
                    </span>
                    {(entry.status === "start" || entry.status === "info") && (
                      <span className="live-feed-dots ml-auto shrink-0" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-hidden px-3 pb-2 pt-4 sm:px-5">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto pr-1">
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            activeToolsCount={activeToolsCount}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
            onRegenerateMessage={onRegenerateMessage}
            onForkMessage={onForkMessage}
            getMessageText={getMessageText}
            t={t}
          />
        </div>
        <BackToBottom
          visible={showBackToBottom}
          onClick={scrollToBottom}
          label={t("chat_back_to_bottom")}
        />
      </div>

      <div className="sticky bottom-0 z-10 border-t border-kumo-line/80 bg-kumo-base/80 px-3 py-3 app-glass sm:px-5">
        <ChatInputArea
          value={input}
          onChange={setInput}
          onSubmit={onSend}
          onStop={onStop}
          commandSuggestions={commandSuggestions}
          isStreaming={isStreaming}
          isConnected={isConnected}
          placeholder={
            activeToolsCount > 0 ? t("chat_placeholder_tools") : t("chat_placeholder_default")
          }
        />
      </div>
    </section>
  );
}
