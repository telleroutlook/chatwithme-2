import { useState, useCallback, memo, useRef, useEffect } from "react";
import { Button } from "@cloudflare/kumo";
import {
  CopyIcon,
  CheckIcon,
  ArrowClockwiseIcon,
  TrashIcon,
  PencilSimpleIcon,
  GitBranchIcon
} from "@phosphor-icons/react";
import { useI18n } from "../hooks/useI18n";

interface MessageActionsProps {
  /** Message content to copy */
  content: string;
  /** Show copy button */
  showCopy?: boolean;
  /** Called when user requests regeneration */
  onRegenerate?: () => void;
  /** Called when user requests edit */
  onEdit?: () => void;
  /** Called when user requests delete */
  onDelete?: () => void;
  /** Show regenerate button */
  showRegenerate?: boolean;
  /** Show edit button */
  showEdit?: boolean;
  /** Show delete button */
  showDelete?: boolean;
  /** Show fork button */
  showFork?: boolean;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Disable mutating actions while keeping non-mutating actions available */
  disableMutations?: boolean;
  /** Compact mode for smaller buttons */
  compact?: boolean;
  /** Called when user requests session fork from this message */
  onFork?: () => void;
}

/**
 * Message action buttons for chat messages
 *
 * Features:
 * - Copy to clipboard with visual feedback
 * - Regenerate response
 * - Edit message (optional)
 * - Delete message (optional)
 */
export const MessageActions = memo(function MessageActions({
  content,
  showCopy = true,
  onRegenerate,
  onEdit,
  onDelete,
  showRegenerate = true,
  showEdit = false,
  showDelete = false,
  showFork = false,
  disabled = false,
  disableMutations = false,
  compact = true,
  onFork
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  const copiedTimerRef = useRef<number | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    if (!navigator.clipboard?.writeText) {
      console.error("Clipboard API is unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setCopyAnnouncement(t("message_actions_copy_status"));
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        setCopyAnnouncement("");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content, disabled, t]);

  const handleRegenerate = useCallback(() => {
    if (disabled || disableMutations || !onRegenerate) return;
    onRegenerate();
  }, [onRegenerate, disabled, disableMutations]);

  const handleEdit = useCallback(() => {
    if (disabled || disableMutations || !onEdit) return;
    onEdit();
  }, [onEdit, disabled, disableMutations]);

  const handleDelete = useCallback(() => {
    if (disabled || disableMutations || !onDelete) return;
    onDelete();
  }, [onDelete, disabled, disableMutations]);

  const handleFork = useCallback(() => {
    if (disabled || disableMutations || !onFork) return;
    onFork();
  }, [disabled, disableMutations, onFork]);

  const buttonSize = compact ? "xs" : "sm";
  const iconSize = compact ? 12 : 14;

  return (
    <div className="mt-0.5 inline-flex items-center gap-1 rounded-lg bg-kumo-base/60 px-1 py-1 backdrop-blur-sm opacity-95 md:opacity-70 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-200">
      <span className="sr-only" role="status" aria-live="polite">
        {copyAnnouncement}
      </span>
      {/* Copy button */}
      {showCopy && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleCopy}
          disabled={disabled}
          icon={copied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
          aria-label={copied ? t("message_actions_copied") : t("message_actions_copy_message")}
        >
          {!compact && (copied ? t("message_actions_copied") : t("message_actions_copy"))}
        </Button>
      )}

      {/* Regenerate button */}
      {showRegenerate && onRegenerate && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleRegenerate}
          disabled={disabled || disableMutations}
          icon={<ArrowClockwiseIcon size={iconSize} />}
          aria-label={t("message_actions_regenerate_response")}
        >
          {!compact && t("message_actions_regenerate")}
        </Button>
      )}

      {/* Edit button */}
      {showEdit && onEdit && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleEdit}
          disabled={disabled || disableMutations}
          icon={<PencilSimpleIcon size={iconSize} />}
          aria-label={t("message_actions_edit_message")}
        >
          {!compact && t("message_actions_edit")}
        </Button>
      )}

      {/* Delete button */}
      {showDelete && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleDelete}
          disabled={disabled || disableMutations || !onDelete}
          icon={<TrashIcon size={iconSize} />}
          aria-label={t("message_actions_delete_message")}
          className="hover:!bg-[color-mix(in_oklab,var(--app-color-danger)_14%,transparent)] hover:!text-[var(--app-color-danger)] focus-visible:!ring-[color-mix(in_oklab,var(--app-color-danger)_45%,transparent)]"
        >
          {!compact && t("message_actions_delete")}
        </Button>
      )}

      {showFork && onFork && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleFork}
          disabled={disabled || disableMutations}
          icon={<GitBranchIcon size={iconSize} />}
          aria-label={t("message_actions_fork_message")}
        >
          {!compact && t("message_actions_fork")}
        </Button>
      )}
    </div>
  );
});

// ============ Action Icon Component ============

interface ActionIconProps {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Compact action icon button for inline use
 */
export function ActionIcon({
  icon,
  onClick,
  title,
  disabled = false,
  danger = false
}: ActionIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-1.5 rounded-md transition-colors
        ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : danger
              ? "hover:bg-[color-mix(in_oklab,var(--app-color-danger)_14%,transparent)] hover:text-[var(--app-color-danger)]"
              : "hover:bg-kumo-control"
        }
        text-kumo-subtle
      `}
    >
      {icon}
    </button>
  );
}
