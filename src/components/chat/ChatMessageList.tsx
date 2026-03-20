import { useCallback, useRef, memo, useEffect } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ChatCircleIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { ChatMessageItem } from "./ChatMessageItem";
import { MessageSkeletonList } from "../skeletons";
import { cn } from "../ui/utils";

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
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
  /** Callback when the scroller element is ready */
  onScrollerReady?: (el: HTMLElement | null) => void;
  /** Additional bottom padding for keyboard/safe-area */
  bottomInset?: number;
}

/**
 * Virtualized message list using react-virtuoso
 *
 * Key features:
 * - Only renders visible messages (supports 1000+ messages)
 * - Auto-scrolls to bottom during streaming
 * - Smooth follow output behavior
 * - Keyboard-aware with bottom inset support
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
  getMessageText,
  t,
  onScrollerReady,
  bottomInset = 0
}: ChatMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);

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
      getMessageText,
      t,
    ]
  );

  // Custom scroller ref handler to expose the actual scrollable element
  const handleScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      // Virtuoso may pass Window, but we only want HTMLElement
      const el = ref instanceof HTMLElement ? ref : null;
      scrollerRef.current = el;
      onScrollerReady?.(el);
    },
    [onScrollerReady]
  );

  // Notify parent when scroller is ready on mount
  useEffect(() => {
    // Initial notification - the actual ref will be set by Virtuoso
    return () => {
      // Cleanup: notify parent that scroller is gone
      onScrollerReady?.(null);
    };
  }, [onScrollerReady]);

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
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <ChatCircleIcon
          size={48}
          className={cn("text-foreground-subtle opacity-30")}
        />
        <p className="text-lg font-medium text-foreground">
          {t("chat_empty_title")}
        </p>
        <p className="text-sm text-foreground-muted">
          {activeToolsCount > 0
            ? t("chat_empty_with_tools", { count: String(activeToolsCount) })
            : t("chat_empty_no_tools")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full px-1 py-1"
      style={{ paddingBottom: bottomInset > 0 ? `${bottomInset}px` : undefined }}
    >
      <Virtuoso
        ref={virtuosoRef}
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
        // Expose the scroller element for unified scroll ownership
        scrollerRef={handleScrollerRef}
      />
    </div>
  );
}

export const ChatMessageList = memo(ChatMessageListInner);
