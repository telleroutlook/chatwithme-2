import { useState, useCallback, memo, useRef, useEffect } from "react";
import { cn } from "./ui/utils";
import {
  CopyIcon,
  CheckIcon,
  ArrowClockwiseIcon,
  TrashIcon,
  PencilSimpleIcon,
  DownloadIcon
} from "@phosphor-icons/react";
import { useI18n } from "../hooks/useI18n";
import { useResponsive } from "../hooks/useResponsive";
import { downloadTextFile } from "../utils/exporters/image";

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
  /** Show export button */
  showExport?: boolean;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Disable mutating actions while keeping non-mutating actions available */
  disableMutations?: boolean;
  /** Compact mode for smaller buttons */
  compact?: boolean;
  /** Optional message ID for export filename */
  messageId?: string;
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
  showExport = false,
  disabled = false,
  disableMutations = false,
  compact = true,
  messageId
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  const copiedTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const { t } = useI18n();
  const { mobile, touch } = useResponsive();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
      if (!mountedRef.current) return;
      setCopied(true);
      setCopyAnnouncement(t("message_actions_copy_status"));
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
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

  const handleExport = useCallback(() => {
    if (disabled) return;
    const filename = messageId ? `message-${messageId}` : "message";
    const exportData = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      message: {
        id: messageId,
        content: content
      }
    };
    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadTextFile(jsonContent, `${filename}.json`, "application/json");
  }, [content, disabled, messageId]);

  const iconSize = compact ? 12 : 14;

  // On mobile/touch devices, ensure buttons are always visible (not hover-dependent)
  // and have adequate touch targets (min 44x44)
  const isTouchDevice = mobile || touch;

  const btnBase = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
    "border border-border bg-surface-elevated hover:bg-muted text-foreground",
    compact ? "h-7 px-2" : "h-8 px-3",
    "disabled:pointer-events-none disabled:opacity-50"
  );

  return (
    <div className={`relative z-10 mt-0.5 inline-flex items-center gap-1 rounded-lg bg-surface-elevated border border-border px-1 py-1 shadow-sm transition-opacity duration-200 ${
      isTouchDevice
        ? "opacity-100"
        : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
    }`}>
      <span className="sr-only" role="status" aria-live="polite">
        {copyAnnouncement}
      </span>
      {/* Copy button */}
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          disabled={disabled}
          aria-label={copied ? t("message_actions_copied") : t("message_actions_copy_message")}
          className={cn(btnBase, isTouchDevice && "min-h-[44px] min-w-[44px] active:scale-95")}
        >
          <span className="shrink-0">{copied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}</span>
          {!compact && (copied ? t("message_actions_copied") : t("message_actions_copy"))}
        </button>
      )}

      {/* Regenerate button */}
      {showRegenerate && onRegenerate && (
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={disabled || disableMutations}
          aria-label={t("message_actions_regenerate_response")}
          className={cn(btnBase, isTouchDevice && "min-h-[44px] min-w-[44px] active:scale-95")}
        >
          <span className="shrink-0"><ArrowClockwiseIcon size={iconSize} /></span>
          {!compact && t("message_actions_regenerate")}
        </button>
      )}

      {/* Edit button */}
      {showEdit && onEdit && (
        <button
          type="button"
          onClick={handleEdit}
          disabled={disabled || disableMutations}
          aria-label={t("message_actions_edit_message")}
          className={cn(btnBase, isTouchDevice && "min-h-[44px] min-w-[44px] active:scale-95")}
        >
          <span className="shrink-0"><PencilSimpleIcon size={iconSize} /></span>
          {!compact && t("message_actions_edit")}
        </button>
      )}

      {/* Delete button */}
      {showDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || disableMutations || !onDelete}
          aria-label={t("message_actions_delete_message")}
          className={cn(
            btnBase,
            "hover:!bg-[color-mix(in_oklab,var(--app-color-danger)_14%,transparent)] hover:!text-[var(--app-color-danger)] focus-visible:!ring-[color-mix(in_oklab,var(--app-color-danger)_45%,transparent)]",
            isTouchDevice && "min-h-[44px] min-w-[44px] active:scale-95"
          )}
        >
          <span className="shrink-0"><TrashIcon size={iconSize} /></span>
          {!compact && t("message_actions_delete")}
        </button>
      )}

      {/* Export button */}
      {showExport && (
        <button
          type="button"
          onClick={handleExport}
          disabled={disabled}
          aria-label={t("message_actions_export")}
          className={cn(btnBase, isTouchDevice && "min-h-[44px] min-w-[44px] active:scale-95")}
        >
          <span className="shrink-0"><DownloadIcon size={iconSize} /></span>
          {!compact && t("message_actions_export")}
        </button>
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
        min-w-[44px] min-h-[44px]
        flex items-center justify-center
        active:scale-95
        ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : danger
              ? "hover:bg-[color-mix(in_oklab,var(--app-color-danger)_14%,transparent)] hover:text-[var(--app-color-danger)]"
              : "hover:bg-muted"
        }
        text-foreground-muted
      `}
    >
      {icon}
    </button>
  );
}
