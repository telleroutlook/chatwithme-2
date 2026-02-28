import { useState, useCallback, useRef, useEffect, memo, useMemo } from "react";
import { Button, Text } from "@cloudflare/kumo";
import {
  PaperPlaneTiltIcon,
  StopIcon,
  XCircleIcon,
  TextAUnderlineIcon,
  LightningIcon
} from "@phosphor-icons/react";
import { useI18n } from "../hooks/useI18n";
import { useCommandInput } from "../hooks/useCommandInput";
import type { CommandSuggestionItem } from "../types/command";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isConnected?: boolean;
  placeholder?: string;
  maxLength?: number;
  showCharCount?: boolean;
  multiline?: boolean;
  maxRows?: number;
  minRows?: number;
  commandSuggestions?: CommandSuggestionItem[];
}

export const ChatInput = memo(function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isConnected = true,
  placeholder = "Type a message...",
  maxLength = 4000,
  showCharCount = true,
  multiline = true,
  maxRows = 8,
  minRows = 1,
  commandSuggestions = []
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const { t } = useI18n();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !multiline) return;

    textarea.style.height = "auto";

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    const minHeight = lineHeight * minRows + paddingTop + paddingBottom;
    const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, multiline, minRows, maxRows]);

  const {
    filteredSuggestions,
    activeIndex,
    setActiveIndex,
    moveSelection,
    getActiveSuggestion,
    applySuggestion,
    hasOpenMenu
  } = useCommandInput({
    input: value,
    caretIndex,
    suggestions: commandSuggestions
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [setActiveIndex, filteredSuggestions.length]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isStreaming || !isConnected) return;
    onSubmit();
  }, [value, isStreaming, isConnected, onSubmit]);

  const handleSuggestionSelect = useCallback(
    (suggestion: CommandSuggestionItem) => {
      const result = applySuggestion(suggestion);
      if (!result) {
        return;
      }

      onChange(result.nextInput);
      queueMicrotask(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(result.nextCaret, result.nextCaret);
          setCaretIndex(result.nextCaret);
        }
      });
    },
    [applySuggestion, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (hasOpenMenu) {
        if (e.key === "Escape") {
          e.preventDefault();
          setCaretIndex(0);
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(0, 0);
          }
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveSelection(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveSelection(-1);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          const active = getActiveSuggestion();
          if (active) {
            e.preventDefault();
            handleSuggestionSelect(active);
            return;
          }
        }
      }

      if (e.key !== "Enter") return;
      if (e.shiftKey) return;
      if (e.metaKey || e.ctrlKey || !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [getActiveSuggestion, handleSubmit, handleSuggestionSelect, hasOpenMenu, moveSelection]
  );

  const handleClear = useCallback(() => {
    onChange("");
    textareaRef.current?.focus();
  }, [onChange]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;
  const isEmpty = !value.trim();
  const canSubmit = !isEmpty && !isStreaming && isConnected && !isOverLimit;
  const helperTextId = "chat-input-helper-text";

  const getPlaceholder = () => {
    if (!isConnected) return t("chat_input_placeholder_connecting");
    if (isStreaming) return t("chat_input_placeholder_streaming");
    return placeholder;
  };

  const groupedSuggestions = useMemo(() => {
    const sectionTitles: Record<CommandSuggestionItem["section"], string> = {
      tools: t("chat_input_section_tools"),
      sessions: t("chat_input_section_sessions"),
      actions: t("chat_input_section_actions")
    };

    const groups: Array<{ section: string; items: CommandSuggestionItem[] }> = [];
    for (const section of ["tools", "sessions", "actions"] as const) {
      const items = filteredSuggestions.filter((item) => item.section === section);
      if (items.length > 0) {
        groups.push({ section: sectionTitles[section], items });
      }
    }

    return groups;
  }, [filteredSuggestions, t]);

  let globalIndex = -1;

  return (
    <div
      className={`
        app-panel relative flex flex-col rounded-2xl border bg-kumo-base/95 app-glass
        transition-all duration-200
        ${isFocused ? "ring-2 ring-kumo-accent/70 border-kumo-accent" : "border-kumo-line"}
        ${!isConnected ? "opacity-75" : ""}
      `}
      aria-busy={isStreaming}
    >
      <div className="flex items-end gap-2 px-2.5 pt-2.5 pb-2">
        {multiline && (
          <div
            className="hidden shrink-0 p-2 text-kumo-subtle sm:block"
            title={t("chat_input_multiline_indicator")}
          >
            <TextAUnderlineIcon size={16} />
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCaretIndex(e.target.selectionStart ?? 0);
          }}
          onClick={(e) => setCaretIndex((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            setIsFocused(true);
            setCaretIndex(e.target.selectionStart ?? 0);
          }}
          onBlur={() => setIsFocused(false)}
          onSelect={(e) => setCaretIndex((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          placeholder={getPlaceholder()}
          disabled={!isConnected}
          maxLength={maxLength}
          rows={minRows}
          aria-describedby={helperTextId}
          className={`
            flex-1 resize-none bg-transparent text-sm text-kumo-default
            placeholder:text-kumo-inactive focus:outline-none
            disabled:cursor-not-allowed disabled:opacity-50
            ${multiline ? "py-2.5" : "py-2"}
          `}
          style={{
            minHeight: multiline ? `${minRows * 20}px` : undefined,
            maxHeight: multiline ? `${maxRows * 20}px` : undefined
          }}
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-lg p-2.5 text-kumo-subtle transition-colors hover:bg-kumo-control hover:text-kumo-default"
            title={t("chat_input_action_clear")}
            aria-label={t("chat_input_action_clear")}
          >
            <XCircleIcon size={18} />
          </button>
        )}

        {isStreaming ? (
          <Button
            type="button"
            variant="secondary"
            onClick={handleStop}
            icon={<StopIcon size={16} weight="fill" />}
            className="min-h-10 min-w-10 rounded-lg px-3 sm:px-4"
            aria-label={t("chat_input_action_stop")}
          >
            <span className="hidden sm:inline">{t("chat_input_action_stop")}</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            icon={<PaperPlaneTiltIcon size={16} />}
            className="min-h-10 min-w-10 rounded-lg px-3 sm:px-4"
            aria-label={t("chat_input_action_send")}
          >
            <span className="hidden sm:inline">{t("chat_input_action_send")}</span>
          </Button>
        )}
      </div>

      {hasOpenMenu && (
        <div className="mx-2.5 mb-2 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-primary)]/95 p-2 shadow-[var(--app-shadow-soft)]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
            <LightningIcon size={12} />
            {t("chat_input_command_hint")}
          </div>
          <div className="space-y-1">
            {groupedSuggestions.map((group) => (
              <div key={group.section}>
                <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--app-text-muted)]">
                  {group.section}
                </div>
                {group.items.map((item) => {
                  globalIndex += 1;
                  const isActive = globalIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestionSelect(item)}
                      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left ${
                        isActive
                          ? "bg-[var(--app-surface-secondary)]"
                          : "hover:bg-[var(--app-surface-secondary)]/70"
                      }`}
                    >
                      <span className="font-mono text-xs text-[var(--app-accent)]">
                        {item.trigger}
                        {item.value}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-[var(--app-text-primary)]">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block truncate text-[11px] text-[var(--app-text-muted)]">
                            {item.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {(showCharCount || multiline) && (value || isFocused || isStreaming || !isConnected) && (
        <div className="flex items-center justify-between px-3.5 pb-2.5">
          <span id={helperTextId} className="pr-2">
            <Text size="xs" variant="secondary">
              {multiline ? t("chat_input_hint_shortcuts") : ""}
            </Text>
          </span>
          {showCharCount ? (
            <Text size="xs" variant={isOverLimit ? "error" : "secondary"}>
              {charCount}/{maxLength}
            </Text>
          ) : null}
        </div>
      )}
    </div>
  );
});

interface SimpleChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isConnected?: boolean;
  placeholder?: string;
}

export function SimpleChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isConnected = true,
  placeholder = "Type a message..."
}: SimpleChatInputProps) {
  const { t } = useI18n();

  const handleSubmit = useCallback(() => {
    if (value.trim() && !isStreaming && isConnected) {
      onSubmit();
    }
  }, [value, isStreaming, isConnected, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? placeholder : t("chat_input_placeholder_connecting")}
        disabled={!isConnected}
        className="flex-1 rounded-xl border border-kumo-line bg-kumo-base px-4 py-2 text-sm text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent disabled:opacity-50"
      />
      {isStreaming ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onStop}
          icon={<StopIcon size={16} weight="fill" />}
          aria-label={t("chat_input_action_stop")}
        >
          {t("chat_input_action_stop")}
        </Button>
      ) : (
        <Button
          type="submit"
          variant="primary"
          onClick={handleSubmit}
          disabled={!value.trim() || !isConnected}
          icon={<PaperPlaneTiltIcon size={16} />}
          aria-label={t("chat_input_action_send")}
        >
          {t("chat_input_action_send")}
        </Button>
      )}
    </div>
  );
}
