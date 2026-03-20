import { cn } from "../ui/utils";
import { PaperPlaneTiltIcon, StopIcon } from "@phosphor-icons/react";
import { useI18n } from "../../hooks/useI18n";

interface ChatSendButtonProps {
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: () => void;
  onStop?: () => void;
}

export function ChatSendButton({ disabled, isStreaming, onSend, onStop }: ChatSendButtonProps) {
  const { t } = useI18n();

  // Ensure 44x44 touch target for mobile - use padding to guarantee size
  const touchTargetStyle = { minHeight: 44, minWidth: 44, padding: "10px 12px" };

  if (isStreaming) {
    return (
      <button
        type="button"
        onClick={onStop}
        style={touchTargetStyle}
        aria-label={t("chat_input_action_stop")}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
          "border border-border bg-surface-elevated hover:bg-muted text-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <span className="shrink-0"><StopIcon size={16} weight="fill" /></span>
        <span className="hidden sm:inline">{t("chat_input_action_stop")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={disabled}
      style={{ ...touchTargetStyle, color: "#fff" }}
      aria-label={t("chat_input_action_send")}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
        "bg-accent text-white hover:bg-accent/90 shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      <span className="shrink-0"><PaperPlaneTiltIcon size={16} /></span>
      <span className="hidden sm:inline">{t("chat_input_action_send")}</span>
    </button>
  );
}
