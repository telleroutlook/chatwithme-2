import {
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
} from "react";
import { Button, Text } from "@cloudflare/kumo";
import {
  PaperPlaneTiltIcon,
  StopIcon,
  XCircleIcon,
  TextAUnderlineIcon,
} from "@phosphor-icons/react";

interface ChatInputProps {
  /** Current input value */
  value: string;
  /** Called when input value changes */
  onChange: (value: string) => void;
  /** Called when user submits the message */
  onSubmit: () => void;
  /** Called when user wants to stop generation */
  onStop?: () => void;
  /** Whether the AI is currently streaming */
  isStreaming?: boolean;
  /** Whether the connection is ready */
  isConnected?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character limit */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Enable multiline input */
  multiline?: boolean;
  /** Maximum rows for multiline */
  maxRows?: number;
  /** Minimum rows for multiline */
  minRows?: number;
}

/**
 * Enhanced chat input component with multiline support
 *
 * Features:
 * - Multiline input with Shift+Enter for newlines
 * - Character count display
 * - Clear button
 * - Auto-resize textarea
 * - Stop generation button
 * - Keyboard shortcuts
 */
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
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !multiline) return;

    // Reset height to calculate scrollHeight correctly
    textarea.style.height = "auto";

    // Calculate line height
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    // Calculate min and max heights
    const minHeight = lineHeight * minRows + paddingTop + paddingBottom;
    const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

    // Set height based on content
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, multiline, minRows, maxRows]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isStreaming || !isConnected) return;
    onSubmit();
  }, [value, isStreaming, isConnected, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
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

  // Dynamic placeholder based on state
  const getPlaceholder = () => {
    if (!isConnected) return "Connecting...";
    if (isStreaming) return "Waiting for response...";
    return placeholder;
  };

  return (
    <div
      className={`
        relative flex flex-col rounded-xl border bg-kumo-base
        transition-all duration-200
        ${isFocused
          ? "ring-2 ring-kumo-accent border-kumo-accent"
          : "border-kumo-line"
        }
        ${!isConnected || isStreaming ? "opacity-80" : ""}
      `}
    >
      {/* Input area */}
      <div className="flex items-end gap-2 p-2">
        {/* Multiline indicator */}
        {multiline && (
          <div className="shrink-0 p-2 text-kumo-subtle" title="Shift+Enter for new line">
            <TextAUnderlineIcon size={16} />
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={getPlaceholder()}
          disabled={!isConnected || isStreaming}
          maxLength={maxLength}
          rows={minRows}
          className={`
            flex-1 resize-none bg-transparent text-sm text-kumo-default
            placeholder:text-kumo-inactive
            focus:outline-none
            disabled:cursor-not-allowed disabled:opacity-50
            ${multiline ? "py-2" : "py-2"}
          `}
          style={{
            minHeight: multiline ? `${minRows * 20}px` : undefined,
            maxHeight: multiline ? `${maxRows * 20}px` : undefined,
          }}
        />

        {/* Clear button (only show when there's content) */}
        {value && !isStreaming && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-2 text-kumo-subtle hover:text-kumo-default transition-colors"
            title="Clear input"
          >
            <XCircleIcon size={18} />
          </button>
        )}

        {/* Action buttons */}
        {isStreaming ? (
          <Button
            type="button"
            variant="secondary"
            onClick={handleStop}
            icon={<StopIcon size={16} weight="fill" />}
          >
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={isEmpty || !isConnected || isOverLimit}
            icon={<PaperPlaneTiltIcon size={16} />}
          >
            Send
          </Button>
        )}
      </div>

      {/* Footer: Character count & hints */}
      {showCharCount && (value || isFocused) && (
        <div className="flex items-center justify-between px-3 pb-2">
          <Text size="xs" variant="secondary">
            {multiline ? "Shift+Enter for new line" : ""}
          </Text>
          <Text
            size="xs"
            variant={isOverLimit ? "error" : "secondary"}
          >
            {charCount}/{maxLength}
          </Text>
        </div>
      )}
    </div>
  );
});

// ============ Simple Input Variant ============

interface SimpleChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isConnected?: boolean;
  placeholder?: string;
}

/**
 * Simple single-line input for compact layouts
 */
export function SimpleChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isConnected = true,
  placeholder = "Type a message...",
}: SimpleChatInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isStreaming && isConnected) {
          onSubmit();
        }
      }
    },
    [value, isStreaming, isConnected, onSubmit]
  );

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? placeholder : "Connecting..."}
        disabled={!isConnected || isStreaming}
        className="flex-1 px-4 py-2 text-sm rounded-xl border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent disabled:opacity-50"
      />
      {isStreaming ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onStop}
          icon={<StopIcon size={16} weight="fill" />}
        >
          Stop
        </Button>
      ) : (
        <Button
          type="submit"
          variant="primary"
          disabled={!value.trim() || !isConnected}
          icon={<PaperPlaneTiltIcon size={16} />}
        >
          Send
        </Button>
      )}
    </div>
  );
}
