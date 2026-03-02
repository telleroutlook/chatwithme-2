import { useCallback, useRef, memo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Empty } from "@cloudflare/kumo";
import { ChatCircleIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { ChatMessageItem } from "./ChatMessageItem";
import { MessageSkeletonList } from "../skeletons";

interface ChatMessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  canEdit: boolean;
  variant?: "bubble" | "docs";
  markdownPrefs?: {
    enableAlerts: boolean;
    enableFootnotes: boolean;
    streamCursor: boolean;
  };
  activeToolsCount: number;
  isLoading?: boolean;
  onDeleteMessage: (messageId: UIMessage["id"]) => void;
  onEditMessage: (messageId: UIMessage["id"], content: string) => Promise<void>;
  onRegenerateMessage: (messageId: UIMessage["id"]) => Promise<void>;
  onForkMessage: (messageId: UIMessage["id"]) => Promise<void>;
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

/**
 * Virtualized message list using react-virtuoso
 *
 * Key features:
 * - Only renders visible messages (supports 1000+ messages)
 * - Auto-scrolls to bottom during streaming
 * - Smooth follow output behavior
 */
function ChatMessageListInner({
  messages,
  isStreaming,
  canEdit,
  variant = "bubble",
  markdownPrefs,
  activeToolsCount,
  isLoading,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
  onForkMessage,
  getMessageText,
  t,
}: ChatMessageListProps) {
  const virtuosoRef = useRef<HTMLDivElement>(null);

  // Render individual message item
  const itemContent = useCallback(
    (index: number, message: UIMessage) => (
      <div className="mb-4">
        <ChatMessageItem
          key={message.id}
          message={message}
          isStreaming={isStreaming}
          canEdit={canEdit}
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
      </div>
    ),
    [
      isStreaming,
      canEdit,
      messages.length,
      variant,
      markdownPrefs,
      onDeleteMessage,
      onEditMessage,
      onRegenerateMessage,
      onForkMessage,
      getMessageText,
      t,
    ]
  );

  // Empty state
  if (messages.length === 0) {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <MessageSkeletonList count={2} />
        </div>
      );
    }

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
    <div className="h-full w-full px-1 py-1 pb-4" ref={virtuosoRef}>
      <Virtuoso
        data={messages}
        itemContent={itemContent}
        // Auto-follow during streaming
        followOutput={isStreaming ? "smooth" : false}
        // Align to bottom for chat UX
        alignToBottom
        // Smooth scrolling behavior
        increaseViewportBy={{ top: 200, bottom: 200 }}
        // Overscan for smoother scrolling
        overscan={5}
        // Custom scroller styling
        className="h-full"
      />
    </div>
  );
}

export const ChatMessageList = memo(ChatMessageListInner);
