/**
 * Scroll jump controls - back to top and back to bottom buttons
 */

import { memo } from "react";
import { Button } from "@cloudflare/kumo";
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
        <Button
          className="pointer-events-auto app-panel"
          variant="secondary"
          icon={<ArrowLineUpIcon size={16} />}
          onClick={onScrollToTop}
        >
          {topLabel}
        </Button>
      </div>

      {/* Back to Bottom - positioned at bottom */}
      <div
        className={`pointer-events-none absolute bottom-2 left-0 right-0 z-20 flex justify-center transition-opacity duration-200 ${
          showBackToBottom ? "opacity-100" : "opacity-0"
        }`}
      >
        <Button
          className="pointer-events-auto app-panel"
          variant="secondary"
          icon={<ArrowLineDownIcon size={16} />}
          onClick={onScrollToBottom}
        >
          {bottomLabel}
          {unreadCount > 0 ? ` (${unreadCount})` : ""}
          {modeLabel ? ` · ${modeLabel}` : ""}
        </Button>
      </div>
    </>
  );
});
