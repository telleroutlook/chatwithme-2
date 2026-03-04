import { useEffect, useRef, useState, useCallback, useMemo, type MutableRefObject } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import type { UIMessage } from "ai";
import type { CommandSuggestionItem } from "../../types/command";
import { ChatInputArea, ChatMessageList, LoadingDots } from "../chat";
import { ScrollJumpControls } from "../chat/ScrollJumpControls";
import { useChatAutoScroll } from "../../features/chat/hooks/useChatAutoScroll";
import { trackChatEvent } from "../../features/chat/services/trackChatEvent";
import { useResponsive } from "../../hooks/useResponsive";
import { useVirtualViewport } from "../../hooks/useVirtualViewport";

interface ProgressEntry {
  id: string;
  timestamp: string;
  phase: string;
  message: string;
  status: "start" | "success" | "error" | "info";
  toolName?: string;
  snippet?: string;
  severity?: "low" | "normal" | "high";
  groupKey: string;
}

interface ProgressGroup {
  key: string;
  entries: ProgressEntry[];
}

const DEFAULT_MARKDOWN_PREFS = {
  enableAlerts: true,
  enableFootnotes: true,
  streamCursor: true
} as const;

interface ChatPaneProps {
  messages: UIMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  canEdit: boolean;
  isReadonly: boolean;
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
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
  getMessageText: (message: UIMessage) => string;
  exportCaptureRef?: MutableRefObject<HTMLElement | null>;
}

export function ChatPane({
  messages,
  isStreaming,
  isConnected,
  canEdit,
  isReadonly,
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
  t,
  getMessageText,
  exportCaptureRef
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtuosoScrollerRef = useRef<HTMLElement | null>(null);
  const liveFeedScrollRef = useRef<HTMLDivElement>(null);
  const onAccentTextClass = "text-white hover:text-white";
  const [messageVariant, setMessageVariant] = useState<"bubble" | "docs">("bubble");
  const markdownPrefs = DEFAULT_MARKDOWN_PREFS;
  const { mobile } = useResponsive();
  const activeMessageVariant: "bubble" | "docs" = mobile ? "docs" : messageVariant;
  const isAndroid = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent);
  }, []);

  // Keyboard detection for mobile UX
  const { keyboardVisible, keyboardHeight } = useVirtualViewport({
    keyboardThreshold: 120,
    debounceMs: 50
  });

  // On Android, visual viewport usually already shrinks with keyboard.
  // Adding keyboardHeight as extra list inset creates excessive blank space.
  const messageListBottomInset = mobile && keyboardVisible && !isAndroid ? keyboardHeight : 0;

  const { mode, unreadCount, showBackToBottom, showBackToTop, onScroll, scrollToBottom, scrollToTop } = useChatAutoScroll({
    scrollRef,
    messagesLength: messages.length,
    bottomInset: messageListBottomInset,
    keyboardVisible,
    suspendFollowMsAfterKeyboard: 250
  });

  // Handle scroller ready callback from ChatMessageList
  const handleScrollerReady = useCallback((el: HTMLElement | null) => {
    virtuosoScrollerRef.current = el;
  }, []);

  const handleScrollContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      if (exportCaptureRef) {
        exportCaptureRef.current = el;
      }
    },
    [exportCaptureRef]
  );

  // Keep the live feed panel visible as new progress entries arrive.
  useEffect(() => {
    if (awaitingFirstAssistant) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [awaitingFirstAssistant, liveProgress.length, scrollToBottom]);

  // Keep inner Live execution feed pinned to latest progress entry.
  useEffect(() => {
    if (!awaitingFirstAssistant) {
      return;
    }
    const liveFeedScroller = liveFeedScrollRef.current;
    if (!liveFeedScroller) {
      return;
    }
    requestAnimationFrame(() => {
      liveFeedScroller.scrollTo({
        top: liveFeedScroller.scrollHeight,
        behavior: "auto"
      });
    });
  }, [awaitingFirstAssistant, liveProgress]);

  const formatProgressTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const groupedLiveProgress = useMemo<ProgressGroup[]>(() => {
    const recent = liveProgress.slice(-8);
    return recent.reduce<ProgressGroup[]>((groups, entry) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.key === entry.groupKey) {
        lastGroup.entries.push(entry);
        return groups;
      }
      return [...groups, { key: entry.groupKey, entries: [entry] }];
    }, []);
  }, [liveProgress]);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next: Record<string, boolean> = {};
      const latestGroup = groupedLiveProgress[groupedLiveProgress.length - 1];
      for (const group of groupedLiveProgress) {
        const existing = prev[group.key];
        next[group.key] = existing ?? group.entries.length > 1;
      }
      if (latestGroup) {
        next[latestGroup.key] = false;
      }
      return next;
    });
  }, [groupedLiveProgress]);

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }, []);

  return (
    <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div
        className={`relative flex min-h-0 flex-col overflow-hidden px-3 sm:px-5 ${
          mobile ? "pb-1 pt-2" : "pb-2 pt-3"
        }`}
      >
        {!mobile && (
          <div className="mb-2 flex items-center justify-end gap-2">
            <Button
              variant={messageVariant === "bubble" ? "primary" : "secondary"}
              size="xs"
              className={messageVariant === "bubble" ? onAccentTextClass : ""}
              style={{ minHeight: 44, minWidth: 44, color: messageVariant === "bubble" ? "#fff" : undefined }}
              onClick={() => setMessageVariant("bubble")}
              aria-label={t("chat_message_variant_bubble")}
            >
              {t("chat_message_variant_bubble")}
            </Button>
            <Button
              variant={messageVariant === "docs" ? "primary" : "secondary"}
              size="xs"
              className={messageVariant === "docs" ? onAccentTextClass : ""}
              style={{ minHeight: 44, minWidth: 44, color: messageVariant === "docs" ? "#fff" : undefined }}
              onClick={() => setMessageVariant("docs")}
              aria-label={t("chat_message_variant_docs")}
            >
              {t("chat_message_variant_docs")}
            </Button>
          </div>
        )}
        <div
          ref={handleScrollContainerRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 [overflow-anchor:none]"
        >
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            canEdit={canEdit}
            variant={activeMessageVariant}
            markdownPrefs={markdownPrefs}
            activeToolsCount={activeToolsCount}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
            onRegenerateMessage={onRegenerateMessage}
            getMessageText={getMessageText}
            t={t}
            onScrollerReady={handleScrollerReady}
            bottomInset={messageListBottomInset}
          />
          {awaitingFirstAssistant && (
            <div className="mt-3">
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
                <div ref={liveFeedScrollRef} className="max-h-40 space-y-1.5 overflow-y-auto">
                  {groupedLiveProgress.map((group) => {
                    const entries = group.entries;
                    const latest = entries[entries.length - 1];
                    if (!latest) return null;
                    const isCollapsed = collapsedGroups[group.key] ?? false;
                    const canCollapse = entries.length > 1;
                    const phaseLabel = phaseLabels[latest.phase] || latest.phase;
                    const groupLabel = `${phaseLabel}${latest.toolName ? ` · ${latest.toolName}` : ""}`;
                    return (
                      <div
                        key={group.key}
                        className="rounded-lg border border-kumo-line/70 bg-kumo-base/65 px-2.5 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0">
                            <Text size="xs" bold>
                              {groupLabel}
                              {canCollapse ? ` · ${entries.length}` : ""}
                            </Text>
                          </span>
                          <span className="min-w-0 truncate">
                            <Text size="xs">{latest.snippet || latest.message}</Text>
                          </span>
                          <span className="shrink-0 text-kumo-subtle">
                            <Text size="xs">{formatProgressTime(latest.timestamp)}</Text>
                          </span>
                          {(latest.status === "start" || latest.status === "info") && (
                            <LoadingDots className="shrink-0" />
                          )}
                          {canCollapse && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => toggleGroupCollapsed(group.key)}
                              aria-label={isCollapsed ? t("chat_input_expand") : t("chat_input_collapse")}
                            >
                              {isCollapsed ? t("chat_input_expand") : t("chat_input_collapse")}
                            </Button>
                          )}
                        </div>
                        {canCollapse && !isCollapsed && (
                          <div className="mt-1.5 space-y-1 border-t border-kumo-line/60 pt-1.5">
                            {entries.slice(0, -1).map((entry) => (
                              <div key={entry.id} className="flex min-w-0 items-center gap-2 pl-1">
                                <span className="shrink-0 text-kumo-subtle">
                                  <Text size="xs">{formatProgressTime(entry.timestamp)}</Text>
                                </span>
                                <span className="min-w-0 truncate">
                                  <Text size="xs" variant="secondary">
                                    {entry.snippet || entry.message}
                                  </Text>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Surface>
            </div>
          )}
        </div>
        <ScrollJumpControls
          showBackToTop={showBackToTop}
          showBackToBottom={showBackToBottom}
          onScrollToTop={() => {
            trackChatEvent("scroll_back_top", { mode });
            scrollToTop();
          }}
          onScrollToBottom={() => {
            trackChatEvent("scroll_back_bottom", { unreadCount, mode });
            scrollToBottom();
          }}
          bottomLabel={t("chat_back_to_bottom")}
          topLabel={t("chat_back_to_top")}
          unreadCount={unreadCount}
          modeLabel={mode === "follow" ? t("chat_autoscroll_following") : t("chat_autoscroll_paused")}
        />
      </div>

      <div
        className="shrink-0 border-t border-kumo-line/80 bg-kumo-base/80 px-3 py-3 app-glass sm:px-5"
        style={{
          // Ensure mobile composer clears home-indicator area even when env(safe-area-inset-bottom)
          // resolves to 0 in headless/test runtimes.
          paddingBottom: mobile
            ? "calc(0.75rem + max(var(--safe-area-inset-bottom, 0px), 34px))"
            : undefined
        }}
      >
        <ChatInputArea
          value={input}
          onChange={setInput}
          onSubmit={onSend}
          onStop={onStop}
          commandSuggestions={commandSuggestions}
          isStreaming={isStreaming}
          isConnected={isConnected}
          isReadOnly={isReadonly}
          placeholder={
            activeToolsCount > 0 ? t("chat_placeholder_tools") : t("chat_placeholder_default")
          }
        />
      </div>
    </section>
  );
}
