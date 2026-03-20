import { useState, useCallback, useRef, useEffect, memo, useMemo } from "react";
import { ArrowUpIcon, StopIcon, XCircleIcon } from "@phosphor-icons/react";
import { useI18n } from "../hooks/useI18n";
import { useCommandInput } from "../hooks/useCommandInput";
import type { CommandSuggestionItem } from "../types/command";
import { ChatActionBar } from "./chat/ChatActionBar";
import { cn } from "./ui/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isConnected?: boolean;
  isReadOnly?: boolean;
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
  isReadOnly = false,
  placeholder = "Type a message...",
  maxLength = 4000,
  showCharCount = true,
  multiline = true,
  maxRows = 8,
  minRows = 1,
  commandSuggestions = []
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
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
    if (!value.trim() || isStreaming || !isConnected || isReadOnly || isComposingRef.current) return;
    onSubmit();
  }, [value, isStreaming, isConnected, isReadOnly, onSubmit]);

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
      if (e.shiftKey || isComposingRef.current) return;

      e.preventDefault();
      handleSubmit();
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
  const canSubmit = !isEmpty && !isStreaming && isConnected && !isReadOnly && !isOverLimit;

  const getPlaceholder = () => {
    if (!isConnected) return t("chat_input_placeholder_connecting");
    if (isReadOnly) return t("chat_input_placeholder_readonly");
    if (isStreaming) return t("chat_input_placeholder_streaming");
    return placeholder;
  };

  const groupedSuggestions = useMemo(() => {
    const sectionTitles: Record<CommandSuggestionItem["section"], string> = {
      tools: t("chat_input_section_tools"),
      sessions: t("chat_input_section_sessions"),
      actions: t("chat_input_section_actions"),
      prompts: "Prompts",
      models: "Models",
      files: "Files"
    };

    void sectionTitles;

    const groups: Array<{ section: CommandSuggestionItem["section"]; items: CommandSuggestionItem[] }> = [];
    for (const section of ["tools", "sessions", "actions"] as const) {
      const items = filteredSuggestions.filter((item) => item.section === section);
      if (items.length > 0) {
        groups.push({ section, items });
      }
    }

    return groups;
  }, [filteredSuggestions, t]);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border border-border bg-surface-elevated shadow-soft",
        "transition-all duration-200",
        isFocused && "ring-1 ring-foreground/20",
        !isConnected && "opacity-75"
      )}
      aria-busy={isStreaming}
    >
      <div className="flex items-end gap-2 px-3 pb-2.5 pt-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCaretIndex(e.target.selectionStart ?? 0);
          }}
          onClick={(e) => setCaretIndex((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onFocus={(e) => {
            setIsFocused(true);
            setCaretIndex(e.target.selectionStart ?? 0);
          }}
          onBlur={() => setIsFocused(false)}
          onSelect={(e) => setCaretIndex((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          placeholder={getPlaceholder()}
          disabled={!isConnected || isReadOnly}
          maxLength={maxLength}
          rows={minRows}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-foreground",
            "placeholder:text-foreground-subtle focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            multiline ? "py-1.5" : "py-1"
          )}
          style={{
            minHeight: multiline ? `${minRows * 20}px` : undefined,
            maxHeight: multiline ? `${maxRows * 20}px` : undefined
          }}
        />

        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              title={t("chat_input_action_clear")}
              aria-label={t("chat_input_action_clear")}
            >
              <XCircleIcon size={18} />
            </button>
          )}

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary text-foreground transition-colors hover:bg-surface-secondary/80"
              aria-label={t("chat_input_action_stop")}
            >
              <StopIcon size={16} weight="fill" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                "bg-accent text-accent-foreground",
                "transition-colors",
                canSubmit
                  ? "hover:opacity-90"
                  : "cursor-not-allowed opacity-40"
              )}
              aria-label={t("chat_input_action_send")}
            >
              <ArrowUpIcon size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {hasOpenMenu && (
        <ChatActionBar
          groups={groupedSuggestions}
          activeIndex={activeIndex}
          onSelect={handleSuggestionSelect}
          title={t("chat_input_command_hint")}
        />
      )}

      {showCharCount && (value || isFocused || isStreaming || !isConnected || isReadOnly) && (
        <div className="flex items-center justify-end px-3.5 pb-2">
          <span
            className={cn(
              "text-xs opacity-50",
              isOverLimit ? "text-red-500 opacity-100" : "text-foreground-subtle"
            )}
          >
            {charCount}/{maxLength}
          </span>
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
  isReadOnly?: boolean;
  placeholder?: string;
}

export function SimpleChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isConnected = true,
  isReadOnly = false,
  placeholder = "Type a message..."
}: SimpleChatInputProps) {
  const { t } = useI18n();
  const isComposingRef = useRef(false);

  const handleSubmit = useCallback(() => {
    if (value.trim() && !isStreaming && isConnected && !isReadOnly && !isComposingRef.current) {
      onSubmit();
    }
  }, [value, isStreaming, isConnected, isReadOnly, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !isComposingRef.current) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSubmit = !!value.trim() && isConnected && !isReadOnly;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          !isConnected
            ? t("chat_input_placeholder_connecting")
            : isReadOnly
              ? t("chat_input_placeholder_readonly")
              : placeholder
        }
        disabled={!isConnected || isReadOnly}
        className={cn(
          "flex-1 rounded-2xl border border-border bg-surface-elevated px-4 py-2.5",
          "text-sm text-foreground placeholder:text-foreground-subtle",
          "focus:outline-none focus:ring-1 focus:ring-foreground/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200"
        )}
      />

      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-foreground transition-colors hover:bg-surface-secondary/80"
          aria-label={t("chat_input_action_stop")}
        >
          <StopIcon size={16} weight="fill" />
        </button>
      ) : (
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            "bg-accent text-accent-foreground",
            "transition-colors",
            canSubmit
              ? "hover:opacity-90"
              : "cursor-not-allowed opacity-40"
          )}
          aria-label={t("chat_input_action_send")}
        >
          <ArrowUpIcon size={16} weight="bold" />
        </button>
      )}
    </div>
  );
}
