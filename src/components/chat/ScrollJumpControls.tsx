/**
 * Scroll jump controls - back to top and back to bottom buttons
 */

import { memo } from "react";
import { cn } from "../ui/utils";
import { ArrowLineDownIcon, ArrowLineUpIcon } from "@phosphor-icons/react";

interface ScrollJumpControlsProps {
  showBackToTop: boolean;
  showBackToBottom: boolean;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  bottomLabel: string;
  topLabel?: string;
  unreadCount?: number;
  modeLabel?: string;
}

export const ScrollJumpControls = memo(function ScrollJumpControls({
  showBackToTop,
  showBackToBottom,
  onScrollToTop,
  onScrollToBottom,
  bottomLabel,
  topLabel = "Back to top",
  unreadCount = 0,
  modeLabel
}: ScrollJumpControlsProps) {
  return (
    <>
      {/* Back to Top - positioned at top */}
      <div
        className={`pointer-events-none absolute top-2 left-0 right-0 z-20 flex justify-center transition-opacity duration-200 ${
          showBackToTop ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onScrollToTop}
          className={cn(
            "pointer-events-auto app-panel inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
            "border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3"
          )}
        >
          <span className="shrink-0"><ArrowLineUpIcon size={16} /></span>
          {topLabel}
        </button>
      </div>

      {/* Back to Bottom - positioned at bottom */}
      <div
        className={`pointer-events-none absolute bottom-2 left-0 right-0 z-20 flex justify-center transition-opacity duration-200 ${
          showBackToBottom ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onScrollToBottom}
          className={cn(
            "pointer-events-auto app-panel inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
            "border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3"
          )}
        >
          <span className="shrink-0"><ArrowLineDownIcon size={16} /></span>
          {bottomLabel}
          {unreadCount > 0 ? ` (${unreadCount})` : ""}
          {modeLabel ? ` · ${modeLabel}` : ""}
        </button>
      </div>
    </>
  );
});
