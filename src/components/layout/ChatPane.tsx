import { Badge, Empty, Surface, Text } from "@cloudflare/kumo";
import { ChatCircleIcon } from "@phosphor-icons/react";
import { VList, type VListHandle } from "virtua";
import { MessageActions } from "../MessageActions";
import { MessageSources } from "../MessageSources";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "../ToolCallCard";
import { ChatInput } from "../ChatInput";
import type { UIMessage } from "ai";
import type { CommandSuggestionItem } from "../../types/command";

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
  vListRef: React.RefObject<VListHandle | null>;
  input: string;
  setInput: (value: string) => void;
  commandSuggestions: CommandSuggestionItem[];
  onSend: () => void;
  onStop: () => void;
  onDeleteMessage: (messageId: UIMessage["id"]) => void;
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
  vListRef,
  input,
  setInput,
  commandSuggestions,
  onSend,
  onStop,
  onDeleteMessage,
  t,
  getMessageText,
}: ChatPaneProps) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      {awaitingFirstAssistant && (
        <div className="px-3 pt-3 sm:px-5">
          <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Text size="sm" bold>{t("live_feed_title")}</Text>
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

      <div className="flex-1 min-h-0 overflow-hidden px-3 pb-2 pt-4 sm:px-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty
              icon={<ChatCircleIcon size={32} />}
              title={t("chat_empty_title")}
              description={
                activeToolsCount > 0
                  ? t("chat_empty_with_tools", { count: String(activeToolsCount) })
                  : t("chat_empty_no_tools")
              }
            />
          </div>
        ) : (
          <VList ref={vListRef} style={{ height: "100%" }} className="space-y-4 px-1">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const text = getMessageText(msg);
              const toolCalls = Array.isArray(msg.parts)
                ? extractToolCalls(msg.parts as Array<{ type: string; [key: string]: unknown }>)
                : [];

              return (
                <div key={msg.id} className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                  {!isUser && toolCalls.length > 0 && (
                    <div className="mb-2 w-full max-w-[95%] space-y-2 sm:max-w-[85%]">
                      {toolCalls.map((toolCall, index) => (
                        <ToolCallCard
                          key={`${toolCall.toolName}-${index}`}
                          toolName={toolCall.toolName}
                          state={toolCall.state}
                          input={toolCall.input}
                          output={toolCall.output}
                          errorText={toolCall.errorText}
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className={`w-fit max-w-[95%] rounded-2xl px-4 py-2.5 shadow-[var(--app-shadow-soft)] sm:max-w-[85%] ${
                      isUser
                        ? "bg-kumo-accent text-white"
                        : "bg-kumo-surface/95 text-kumo-default ring ring-kumo-line"
                    }`}
                  >
                    {isUser ? (
                      <span className="block whitespace-pre-wrap"><Text size="sm">{text}</Text></span>
                    ) : (
                      <MarkdownRenderer
                        content={text}
                        isStreaming={isStreaming && msg === messages[messages.length - 1]}
                      />
                    )}
                  </div>

                  {!isUser && (
                    <div className="w-full max-w-[95%] sm:max-w-[85%]">
                      <MessageSources
                        parts={msg.parts}
                        title={t("chat_sources_title")}
                        emptyLabel={t("chat_sources_empty")}
                      />
                    </div>
                  )}

                  <div className="mt-1">
                    <MessageActions
                      content={text}
                      showRegenerate={!isUser}
                      showEdit={isUser}
                      showDelete={true}
                      onDelete={() => onDeleteMessage(msg.id)}
                      disabled={isStreaming}
                      compact={true}
                    />
                  </div>
                </div>
              );
            })}
          </VList>
        )}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-kumo-line/80 bg-kumo-base/80 px-3 py-3 app-glass sm:px-5">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={onSend}
          onStop={onStop}
          commandSuggestions={commandSuggestions}
          isStreaming={isStreaming}
          isConnected={isConnected}
          placeholder={
            activeToolsCount > 0
              ? t("chat_placeholder_tools")
              : t("chat_placeholder_default")
          }
          multiline={true}
          maxRows={6}
          showCharCount={true}
        />
      </div>
    </section>
  );
}
