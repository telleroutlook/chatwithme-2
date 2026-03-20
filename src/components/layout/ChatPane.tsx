import { useEffect, useRef, useState, useCallback, useMemo, type MutableRefObject } from "react";
import type { UIMessage } from "ai";
import type { CommandSuggestionItem } from "../../types/command";
import { ChatInputArea, ChatMessageList, LoadingDots } from "../chat";
import { ScrollJumpControls } from "../chat/ScrollJumpControls";
import { useChatAutoScroll } from "../../features/chat/hooks/useChatAutoScroll";
import { trackChatEvent } from "../../features/chat/services/trackChatEvent";
import { useResponsive } from "../../hooks/useResponsive";
import { useVirtualViewport } from "../../hooks/useVirtualViewport";
import { cn } from "../ui/utils";
import type { UiMessageKey } from "../../i18n/ui";

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
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
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
  const markdownPrefs = DEFAULT_MARKDOWN_PREFS;
  const { mobile } = useResponsive();
  // Bubble/docs variant prop is accepted but we always use docs-style (clean document layout).
  const activeMessageVariant = "docs" as const;

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

  // Keep inner live execution feed pinned to latest progress entry.
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
    <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-surface-chat">
      {/* Message area */}
      <div className="relative flex min-h-0 flex-col overflow-hidden">
        <div
          ref={handleScrollContainerRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none]"
        >
          {/* Centered content column */}
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
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

            {/* Live progress feed */}
            {awaitingFirstAssistant && (
              <div className="mt-4">
                <div className="rounded-lg border border-border bg-surface-chat/80 px-4 py-3">
                  {/* Header */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {t("live_feed_title")}
                    </span>
                    {liveProgress.length > 0 && (
                      <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted tabular-nums">
                        {liveProgress.length}
                      </span>
                    )}
                  </div>

                  {/* Empty / thinking state */}
                  {liveProgress.length === 0 && (
                    <div className="flex items-center gap-2 text-foreground-muted">
                      <span className="text-xs">{t("chat_loading_thinking")}</span>
                      <LoadingDots />
                    </div>
                  )}

                  {/* Progress entries */}
                  <div
                    ref={liveFeedScrollRef}
                    className="max-h-40 space-y-1 overflow-y-auto"
                  >
                    {groupedLiveProgress.map((group) => {
                      const entries = group.entries;
                      const latest = entries[entries.length - 1];
                      if (!latest) return null;
                      const isCollapsed = collapsedGroups[group.key] ?? false;
                      const canCollapse = entries.length > 1;
                      const phaseLabel = phaseLabels[latest.phase] || latest.phase;
                      const groupLabel = `${phaseLabel}${latest.toolName ? ` · ${latest.toolName}` : ""}`;

                      return (
                        <div key={group.key} className="text-xs">
                          {/* Group header row */}
                          <div className="flex min-w-0 items-center gap-2 py-0.5">
                            <span className="shrink-0 font-medium text-foreground">
                              {groupLabel}
                              {canCollapse ? ` · ${entries.length}` : ""}
                            </span>
                            <span className="min-w-0 truncate text-foreground-muted">
                              {latest.snippet || latest.message}
                            </span>
                            <span className="ml-auto shrink-0 text-foreground-muted tabular-nums">
                              {formatProgressTime(latest.timestamp)}
                            </span>
                            {(latest.status === "start" || latest.status === "info") && (
                              <LoadingDots className="shrink-0" />
                            )}
                            {canCollapse && (
                              <button
                                type="button"
                                className="shrink-0 text-foreground-muted underline-offset-2 hover:text-foreground hover:underline"
                                onClick={() => toggleGroupCollapsed(group.key)}
                                aria-label={isCollapsed ? t("chat_input_expand") : t("chat_input_collapse")}
                              >
                                {isCollapsed ? t("chat_input_expand") : t("chat_input_collapse")}
                              </button>
                            )}
                          </div>

                          {/* Expanded sub-entries */}
                          {canCollapse && !isCollapsed && (
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
                              {entries.slice(0, -1).map((entry) => (
                                <div key={entry.id} className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 text-foreground-muted tabular-nums">
                                    {formatProgressTime(entry.timestamp)}
                                  </span>
                                  <span className="min-w-0 truncate text-foreground-muted">
                                    {entry.snippet || entry.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
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

      {/* Input area — floats at the bottom with a gradient fade above */}
      <div className="relative shrink-0">
        {/* Gradient fade */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-surface-chat to-transparent"
          aria-hidden="true"
        />

        <div
          className={cn(
            "border-t border-border bg-surface-chat/95 backdrop-blur-sm",
            mobile ? "px-3 py-3" : "px-4 py-4"
          )}
          style={{
            paddingBottom: mobile
              ? "calc(0.75rem + max(var(--safe-area-inset-bottom, 0px), 34px))"
              : undefined
          }}
        >
          {/* Keep input constrained to the same reading width */}
          <div className="mx-auto w-full max-w-3xl">
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
        </div>
      </div>
    </section>
  );
}
