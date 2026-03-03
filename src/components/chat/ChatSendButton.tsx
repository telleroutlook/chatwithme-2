import { Button } from "@cloudflare/kumo";
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
      <Button
        type="button"
        variant="secondary"
        onClick={onStop}
        icon={<StopIcon size={16} weight="fill" />}
        className="rounded-lg"
        style={touchTargetStyle}
        aria-label={t("chat_input_action_stop")}
      >
        <span className="hidden sm:inline">{t("chat_input_action_stop")}</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      onClick={onSend}
      disabled={disabled}
      icon={<PaperPlaneTiltIcon size={16} />}
      className="rounded-lg text-white hover:text-white"
      style={{ ...touchTargetStyle, color: "#fff" }}
      aria-label={t("chat_input_action_send")}
    >
      <span className="hidden sm:inline">{t("chat_input_action_send")}</span>
    </Button>
  );
}
