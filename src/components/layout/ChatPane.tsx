import { useRef, useState } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import type { UIMessage } from "ai";
import type { CommandSuggestionItem } from "../../types/command";
import { ChatInputArea, ChatMessageList, BackToBottom, LoadingDots } from "../chat";
import { useChatAutoScroll } from "../../features/chat/hooks/useChatAutoScroll";
import { trackChatEvent } from "../../features/chat/services/trackChatEvent";

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
  mcpConnectedServers: number;
  mcpTotalServers: number;
  awaitingFirstAssistant: boolean;
  liveProgress: ProgressEntry[];
  phaseLabels: Record<string, string>;
  input: string;
  setInput: (value: string) => void;
  commandSuggestions: CommandSuggestionItem[];
  onSend: () => void;
  onStop: () => void;
  onRetryConnection: () => void;
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
  mcpConnectedServers,
  mcpTotalServers,
  awaitingFirstAssistant,
  liveProgress,
  phaseLabels,
  input,
  setInput,
  commandSuggestions,
  onSend,
  onStop,
  onRetryConnection,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
  onForkMessage,
  t,
  getMessageText
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messageVariant, setMessageVariant] = useState<"bubble" | "docs">("bubble");
  const [markdownPrefs, setMarkdownPrefs] = useState(() => ({
    enableAlerts: true,
    enableFootnotes: true,
    streamCursor: true
  }));
  const { mode, unreadCount, showBackToBottom, onScroll, scrollToBottom } = useChatAutoScroll({
    scrollRef,
    messagesLength: messages.length
  });

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-3 sm:px-5">
        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "primary" : "secondary"}>
                MCP {mcpConnectedServers}/{mcpTotalServers}
              </Badge>
              <Badge variant="secondary">{t("tabs_tools_count", { count: String(activeToolsCount) })}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant={markdownPrefs.streamCursor ? "primary" : "secondary"}
                onClick={() =>
                  setMarkdownPrefs((prev) => ({ ...prev, streamCursor: !prev.streamCursor }))
                }
              >
                Stream
              </Button>
              <Button
                size="xs"
                variant={markdownPrefs.enableAlerts ? "primary" : "secondary"}
                onClick={() =>
                  setMarkdownPrefs((prev) => ({ ...prev, enableAlerts: !prev.enableAlerts }))
                }
              >
                Alerts
              </Button>
              <Button
                size="xs"
                variant={markdownPrefs.enableFootnotes ? "primary" : "secondary"}
                onClick={() =>
                  setMarkdownPrefs((prev) => ({ ...prev, enableFootnotes: !prev.enableFootnotes }))
                }
              >
                Footnotes
              </Button>
              {!isConnected && (
                <Button size="xs" variant="secondary" onClick={onRetryConnection}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </Surface>
      </div>

      {awaitingFirstAssistant && (
        <div className="px-3 pt-3 sm:px-5">
          <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Text size="sm" bold>
                {t("live_feed_title")}
              </Text>
              <Badge variant="secondary">{liveProgress.length}</Badge>
            </div>
            {liveProgress.length === 0 && (
              <div className="mb-2 flex items-center gap-2 text-kumo-subtle">
                <Text size="xs">{t("chat_loading_thinking")}</Text>
                <LoadingDots />
              </div>
            )}
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
                      <LoadingDots className="ml-auto shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-hidden px-3 pb-2 pt-4 sm:px-5">
        <div className="mb-2 flex items-center justify-end gap-2">
          <Button
            variant={messageVariant === "bubble" ? "primary" : "secondary"}
            size="xs"
            onClick={() => setMessageVariant("bubble")}
            aria-label={t("chat_message_variant_bubble")}
          >
            {t("chat_message_variant_bubble")}
          </Button>
          <Button
            variant={messageVariant === "docs" ? "primary" : "secondary"}
            size="xs"
            onClick={() => setMessageVariant("docs")}
            aria-label={t("chat_message_variant_docs")}
          >
            {t("chat_message_variant_docs")}
          </Button>
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto pr-1">
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            variant={messageVariant}
            markdownPrefs={markdownPrefs}
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
          onClick={() => {
            trackChatEvent("scroll_back_bottom", { unreadCount, mode });
            scrollToBottom();
          }}
          label={t("chat_back_to_bottom")}
          unreadCount={unreadCount}
          modeLabel={mode === "follow" ? t("chat_autoscroll_following") : t("chat_autoscroll_paused")}
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
