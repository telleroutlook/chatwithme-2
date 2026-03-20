import { cn } from "../ui/utils";
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
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "pointer-events-auto app-panel inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
          "border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3"
        )}
      >
        <span className="shrink-0"><ArrowLineDownIcon size={16} /></span>
        {label}
        {unreadCount > 0 ? ` (${unreadCount})` : ""}
        {modeLabel ? ` · ${modeLabel}` : ""}
      </button>
    </div>
  );
}
