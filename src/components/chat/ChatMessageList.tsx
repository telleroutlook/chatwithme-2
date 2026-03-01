import { Empty } from "@cloudflare/kumo";
import { ChatCircleIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { ChatMessageItem } from "./ChatMessageItem";

interface ChatMessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  variant?: "bubble" | "docs";
  markdownPrefs?: {
    enableAlerts: boolean;
    enableFootnotes: boolean;
    streamCursor: boolean;
  };
  activeToolsCount: number;
  onDeleteMessage: (messageId: UIMessage["id"]) => void;
  onEditMessage: (messageId: UIMessage["id"], content: string) => Promise<void>;
  onRegenerateMessage: (messageId: UIMessage["id"]) => Promise<void>;
  onForkMessage: (messageId: UIMessage["id"]) => Promise<void>;
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function ChatMessageList({
  messages,
  isStreaming,
  variant = "bubble",
  markdownPrefs,
  activeToolsCount,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
  onForkMessage,
  getMessageText,
  t
}: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-4 px-1 py-1 pb-4">
      {messages.map((message, index) => (
        <ChatMessageItem
          key={message.id}
          message={message}
          isStreaming={isStreaming}
          isLastMessage={index === messages.length - 1}
          variant={variant}
          markdownPrefs={markdownPrefs}
          onDelete={onDeleteMessage}
          onEdit={onEditMessage}
          onRegenerate={onRegenerateMessage}
          onFork={onForkMessage}
          getMessageText={getMessageText}
          t={t}
        />
      ))}
    </div>
  );
}
