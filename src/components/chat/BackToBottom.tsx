import { Button } from "@cloudflare/kumo";
import { ArrowLineDownIcon } from "@phosphor-icons/react";

interface BackToBottomProps {
  visible: boolean;
  onClick: () => void;
  label: string;
  unreadCount?: number;
  modeLabel?: string;
}

export function BackToBottom({
  visible,
  onClick,
  label,
  unreadCount = 0,
  modeLabel
}: BackToBottomProps) {
  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-0 right-0 z-20 flex justify-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <Button
        className="pointer-events-auto app-panel"
        variant="secondary"
        icon={<ArrowLineDownIcon size={16} />}
        onClick={onClick}
      >
        {label}
        {unreadCount > 0 ? ` (${unreadCount})` : ""}
        {modeLabel ? ` · ${modeLabel}` : ""}
      </Button>
    </div>
  );
}
