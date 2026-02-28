import { useState, useCallback, memo } from "react";
import { Button } from "@cloudflare/kumo";
import {
  CopyIcon,
  CheckIcon,
  ArrowClockwiseIcon,
  TrashIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";

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
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Compact mode for smaller buttons */
  compact?: boolean;
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
  disabled = false,
  compact = true,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    if (!navigator.clipboard?.writeText) {
      console.error("Clipboard API is unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content, disabled]);

  const handleRegenerate = useCallback(() => {
    if (disabled || !onRegenerate) return;
    onRegenerate();
  }, [onRegenerate, disabled]);

  const handleEdit = useCallback(() => {
    if (disabled || !onEdit) return;
    onEdit();
  }, [onEdit, disabled]);

  const handleDelete = useCallback(() => {
    if (disabled || !onDelete) return;
    onDelete();
  }, [onDelete, disabled]);

  const buttonSize = compact ? "xs" : "sm";
  const iconSize = compact ? 12 : 14;

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {/* Copy button */}
      {showCopy && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleCopy}
          disabled={disabled}
          icon={copied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
          aria-label={copied ? "Copied" : "Copy message"}
        >
          {!compact && (copied ? "Copied" : "Copy")}
        </Button>
      )}

      {/* Regenerate button */}
      {showRegenerate && onRegenerate && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleRegenerate}
          disabled={disabled}
          icon={<ArrowClockwiseIcon size={iconSize} />}
          aria-label="Regenerate response"
        >
          {!compact && "Regenerate"}
        </Button>
      )}

      {/* Edit button */}
      {showEdit && onEdit && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleEdit}
          disabled={disabled}
          icon={<PencilSimpleIcon size={iconSize} />}
          aria-label="Edit message"
        >
          {!compact && "Edit"}
        </Button>
      )}

      {/* Delete button */}
      {showDelete && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={handleDelete}
          disabled={disabled || !onDelete}
          icon={<TrashIcon size={iconSize} />}
          aria-label="Delete message"
          className="hover:!bg-red-500/20 hover:!text-red-500"
        >
          {!compact && "Delete"}
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
  danger = false,
}: ActionIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-1.5 rounded-md transition-colors
        ${disabled
          ? "opacity-50 cursor-not-allowed"
          : danger
            ? "hover:bg-red-500/20 hover:text-red-500"
            : "hover:bg-kumo-control"
        }
        text-kumo-subtle
      `}
    >
      {icon}
    </button>
  );
}
