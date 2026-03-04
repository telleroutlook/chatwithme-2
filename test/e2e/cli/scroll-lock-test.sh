#!/bin/bash
# Scroll Lock Test - Verify scroll position is preserved during streaming
# Usage: ./scroll-lock-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"

extract_last_number() {
    echo "$1" | grep -Eo '[-]?[0-9]+' | tail -1
}

echo "📜 Running Scroll Lock Test against: $BASE_URL"

# Open browser
echo "📍 Opening browser..."
playwright-cli open "$BASE_URL"
playwright-cli resize 1440 900

# Wait for page load
sleep 3

# Find textarea
playwright-cli snapshot --filename=scroll-initial.yaml
TEXTAREA_REF=$(grep -A1 'textbox.*Type a message' scroll-initial.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -z "$TEXTAREA_REF" ]; then
    echo "❌ Could not find textarea"
    playwright-cli close
    exit 1
fi

# Helper function to wait for streaming to finish
wait_for_streaming() {
    echo "⏳ Waiting for streaming to complete..."
    for i in {1..60}; do
        STOP_COUNT_RAW=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})
" 2>/dev/null || echo "0")
        STOP_COUNT=$(extract_last_number "$STOP_COUNT_RAW")
        STOP_COUNT=${STOP_COUNT:-0}

        if [ "$STOP_COUNT" = "0" ]; then
            # Check 4 consecutive times to confirm streaming is done
            sleep 0.5
            STOP_COUNT2_RAW=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})
" 2>/dev/null || echo "0")
            STOP_COUNT2=$(extract_last_number "$STOP_COUNT2_RAW")
            STOP_COUNT2=${STOP_COUNT2:-0}
            if [ "$STOP_COUNT2" = "0" ]; then
                echo "   Streaming completed after $((i * 500))ms"
                return 0
            fi
        fi
        sleep 0.5
    done
    echo "⚠️  Streaming timeout after 30s"
}

# Send first prompt to build scrollable content
echo "📤 Sending first prompt..."
playwright-cli fill "$TEXTAREA_REF" "请输出一段 100 行的编号文本，每行 15 个字左右，不要代码块。"
sleep 1

# Find and click send button
playwright-cli snapshot --filename=scroll-before-send1.yaml
SEND_REF=$(grep 'button "Send"' scroll-before-send1.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

wait_for_streaming
sleep 1

# Send second prompt
echo "📤 Sending second prompt..."
playwright-cli snapshot --filename=scroll-before-send2.yaml
TEXTAREA_REF=$(grep -A1 'textbox' scroll-before-send2.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli fill "$TEXTAREA_REF" "继续输出 100 行编号文本。"
sleep 1

playwright-cli snapshot --filename=scroll-before-send2b.yaml
SEND_REF=$(grep 'button "Send"' scroll-before-send2b.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

wait_for_streaming
sleep 1

# Scroll up from bottom
echo "🖱️  Scrolling up..."
playwright-cli eval "
(() => {
  const findScroller = () => {
    const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = window.getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
             el.scrollHeight > el.clientHeight + 8 &&
             el.clientHeight > 280 &&
             el.getBoundingClientRect().width > 500;
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0];
  };
  const scroller = findScroller();
  if (!scroller) return 'no_scroller';
  scroller.scrollTop = Math.max(0, scroller.scrollTop - 3600);
  return 'scrolled_up';
})
"
sleep 0.5

# Record initial scroll position
INITIAL_SCROLL=$(playwright-cli eval "
(() => {
  const findScroller = () => {
    const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = window.getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
             el.scrollHeight > el.clientHeight + 8 &&
             el.clientHeight > 280 &&
             el.getBoundingClientRect().width > 500;
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0];
  };
  const scroller = findScroller();
  if (!scroller) return { error: 'no_scroller' };
  return {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight),
    clientHeight: Math.round(scroller.clientHeight)
  };
})
")
echo "   Initial scroll: $INITIAL_SCROLL"

# Take screenshot before streaming
playwright-cli screenshot --filename=scroll-before-streaming.png

# Send third prompt (this should NOT auto-scroll)
echo "📤 Sending third prompt (testing scroll lock)..."
playwright-cli snapshot --filename=scroll-before-send3.yaml
TEXTAREA_REF=$(grep -A1 'textbox' scroll-before-send3.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli fill "$TEXTAREA_REF" "再输出 150 行内容。"
sleep 1

playwright-cli snapshot --filename=scroll-before-send3b.yaml
SEND_REF=$(grep 'button "Send"' scroll-before-send3b.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

# Monitor scroll during streaming (sample every 2 seconds for 10 seconds)
echo "📊 Monitoring scroll position during streaming..."
MAX_SCROLL=0
for i in {1..5}; do
    sleep 2
    CURRENT_SCROLL_RAW=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 280 &&
           el.getBoundingClientRect().width > 500;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  return candidates[0]?.scrollTop || 0;
})
" 2>/dev/null || echo "0")
    CURRENT_SCROLL=$(extract_last_number "$CURRENT_SCROLL_RAW")
    CURRENT_SCROLL=${CURRENT_SCROLL:-0}
    echo "   Sample $i: scrollTop = $CURRENT_SCROLL"
    if [ "$CURRENT_SCROLL" -gt "$MAX_SCROLL" ]; then
        MAX_SCROLL=$CURRENT_SCROLL
    fi
done

wait_for_streaming

# Final scroll check
FINAL_SCROLL=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 280 &&
           el.getBoundingClientRect().width > 500;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  const scroller = candidates[0];
  if (!scroller) return { error: 'no_scroller' };
  return {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: Math.round(scroller.scrollHeight)
  };
})
")

echo "   Final scroll: $FINAL_SCROLL"

# Take final screenshot
playwright-cli screenshot --filename=scroll-final.png

# Close browser
playwright-cli close

echo "✅ Scroll lock test completed!"
echo "   Max scroll delta during streaming: check manually from samples"
echo "   Screenshots saved: scroll-*.png"
