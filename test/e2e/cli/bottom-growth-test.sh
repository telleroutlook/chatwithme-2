#!/bin/bash
# Bottom Growth Test - Verify scroll behavior when content grows at bottom
# Usage: ./bottom-growth-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"

echo "📈 Running Bottom Growth Test against: $BASE_URL"

# Open browser
echo "📍 Opening browser..."
playwright-cli open "$BASE_URL"
playwright-cli resize 1440 900

sleep 3

# Find textarea
playwright-cli snapshot --filename=growth-initial.yaml
TEXTAREA_REF=$(grep -A1 'textbox.*Type a message' growth-initial.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -z "$TEXTAREA_REF" ]; then
    echo "❌ Could not find textarea"
    playwright-cli close
    exit 1
fi

# Helper function to wait for streaming
wait_for_streaming() {
    echo "⏳ Waiting for streaming..."
    for i in {1..60}; do
        STOP_COUNT=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})()
" 2>/dev/null || echo "0")
        if [ "$STOP_COUNT" = "0" ]; then
            sleep 0.5
            STOP_COUNT2=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})()
" 2>/dev/null || echo "0")
            if [ "$STOP_COUNT2" = "0" ]; then
                return 0
            fi
        fi
        sleep 0.5
    done
}

# Send prompt that generates long content
echo "📤 Sending prompt for long content..."
playwright-cli fill "$TEXTAREA_REF" "请只返回一个 html 代码块，内部放一个高度 2200px 的 div 和可见文字。"
sleep 1

playwright-cli snapshot --filename=growth-before-send.yaml
SEND_REF=$(grep -B1 'button "Send"' growth-before-send.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

wait_for_streaming
sleep 1

# Scroll to bottom
echo "🖱️  Scrolling to bottom..."
playwright-cli eval "
(() => {
  const findScroller = () => {
    const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = window.getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
             el.scrollHeight > el.clientHeight + 8 &&
             el.clientHeight > 200 &&
             el.getBoundingClientRect().width > 500;
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0];
  };
  const scroller = findScroller();
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  return scroller ? 'scrolled' : 'no_scroller';
})()
"

# Record before metrics
echo "📊 Recording scroll metrics..."
BEFORE_METRICS=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 200 &&
           el.getBoundingClientRect().width > 500;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  const scroller = candidates[0];
  if (!scroller) return { error: 'no_scroller' };
  return {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: Math.round(scroller.clientHeight)
  };
})()
")
echo "   Before: $BEFORE_METRICS"

# Wait and check if scroll position is maintained
sleep 3

AFTER_METRICS=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 200 &&
           el.getBoundingClientRect().width > 500;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  const scroller = candidates[0];
  if (!scroller) return { error: 'no_scroller' };
  return {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: Math.round(scroller.clientHeight),
    growth: Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight)
  };
})()
")
echo "   After: $AFTER_METRICS"

# Take screenshot
playwright-cli screenshot --filename=bottom-growth-check.png

# Close browser
playwright-cli close

echo "✅ Bottom growth test completed!"
echo "   Screenshot saved: bottom-growth-check.png"
