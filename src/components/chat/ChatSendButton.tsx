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

  if (isStreaming) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={onStop}
        icon={<StopIcon size={16} weight="fill" />}
        className="min-h-10 min-w-10 rounded-lg px-3 sm:px-4"
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
      className="min-h-10 min-w-10 rounded-lg px-3 sm:px-4"
      aria-label={t("chat_input_action_send")}
    >
      <span className="hidden sm:inline">{t("chat_input_action_send")}</span>
    </Button>
  );
}
