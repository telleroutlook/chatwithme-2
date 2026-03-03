#!/bin/bash
# Mobile Sheet Scroll Lock Test - Test scroll position preservation with modals
# Usage: ./mobile-sheet-scrolllock-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
IPHONE_WIDTH=390
IPHONE_HEIGHT=844

echo "📱 Running Mobile Sheet Scroll Lock Test against: $BASE_URL"

# Open browser with mobile viewport
echo "📍 Opening browser with mobile viewport..."
playwright-cli open "$BASE_URL"
playwright-cli resize "$IPHONE_WIDTH" "$IPHONE_HEIGHT"

sleep 3

# Find textarea
playwright-cli snapshot --filename=mobile-scroll-initial.yaml
TEXTAREA_REF=$(grep -A1 'textbox.*Type a message' mobile-scroll-initial.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -z "$TEXTAREA_REF" ]; then
    echo "❌ Could not find textarea"
    playwright-cli close
    exit 1
fi

# Helper function
wait_for_streaming() {
    for i in {1..60}; do
        STOP_COUNT=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})
" 2>/dev/null || echo "0")
        if [ "$STOP_COUNT" = "0" ]; then
            sleep 0.5
            STOP_COUNT2=$(playwright-cli eval "
(() => {
  const stopBtns = document.querySelectorAll('button[aria-label=\"Stop\"], button[aria-label=\"停止\"]');
  return stopBtns.length;
})
" 2>/dev/null || echo "0")
            if [ "$STOP_COUNT2" = "0" ]; then
                return 0
            fi
        fi
        sleep 0.5
    done
}

# Build scrollable content
echo "📤 Building scrollable content..."
playwright-cli fill "$TEXTAREA_REF" "Please output a numbered list of 80 lines, each line 12-20 characters, no code blocks."
sleep 1

playwright-cli snapshot --filename=mobile-scroll-send1.yaml
SEND_REF=$(grep 'button "Send"' mobile-scroll-send1.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

wait_for_streaming
sleep 1

# Second message
playwright-cli snapshot --filename=mobile-scroll-send2.yaml
TEXTAREA_REF=$(grep -A1 'textbox' mobile-scroll-send2.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli fill "$TEXTAREA_REF" "Continue with another 80 lines of numbered text."
sleep 1

playwright-cli snapshot --filename=mobile-scroll-send2b.yaml
SEND_REF=$(grep 'button "Send"' mobile-scroll-send2b.yaml | grep -oP 'ref=\K[^]]+' | head -1)
playwright-cli click "$SEND_REF"

wait_for_streaming
sleep 1

# Scroll up
echo "🖱️  Scrolling up..."
playwright-cli eval "
(() => {
  const findScroller = () => {
    const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = window.getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
             el.scrollHeight > el.clientHeight + 8 &&
             el.clientHeight > 200 &&
             el.getBoundingClientRect().width > 100;
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0];
  };
  const scroller = findScroller();
  if (scroller) scroller.scrollBy({ top: -800, behavior: 'auto' });
})
"
sleep 1

# Record initial scroll
INITIAL_SCROLL=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 200 &&
           el.getBoundingClientRect().width > 100;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  return Math.round(candidates[0]?.scrollTop || 0);
})
")
echo "   Initial scroll position: $INITIAL_SCROLL"

# Try to open sidebar
echo "📂 Attempting to open sidebar..."
SIDEBAR_OPENED=false

# Try clicking the menu toggle button
playwright-cli snapshot --filename=mobile-before-sidebar.yaml
MENU_REF=$(grep -i 'toggle sidebar\|menu' mobile-before-sidebar.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -n "$MENU_REF" ]; then
    playwright-cli click "$MENU_REF"
    sleep 1
    SIDEBAR_OPENED=true
    echo "   Sidebar opened via menu button"
else
    # Alternative: try first button in header
    HEADER_BTN=$(playwright-cli eval "
(() => {
  const header = document.querySelector('header, nav');
  if (!header) return null;
  const btn = header.querySelector('button');
  return btn ? 'found' : null;
})
")
    if [ "$HEADER_BTN" = "found" ]; then
        playwright-cli eval "
(() => {
  const header = document.querySelector('header, nav');
  const btn = header?.querySelector('button');
  if (btn) btn.click();
})
"
        sleep 1
        SIDEBAR_OPENED=true
        echo "   Sidebar opened via header button"
    fi
fi

if [ "$SIDEBAR_OPENED" = true ]; then
    # Take screenshot with sidebar open
    playwright-cli screenshot --filename=mobile-sidebar-open.png

    # Check scroll state
    OPEN_SCROLL=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 200 &&
           el.getBoundingClientRect().width > 100;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  return Math.round(candidates[0]?.scrollTop || 0);
})
")
    echo "   Scroll with sidebar open: $OPEN_SCROLL"

    # Close sidebar (click outside or press Escape)
    echo "📂 Closing sidebar..."
    playwright-cli mousemove 350 400
    playwright-cli click 350 400
    sleep 1

    # Or try Escape
    playwright-cli press Escape
    sleep 1
fi

# Check final scroll position
FINAL_SCROLL=$(playwright-cli eval "
(() => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
    const s = window.getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight + 8 &&
           el.clientHeight > 200 &&
           el.getBoundingClientRect().width > 100;
  });
  candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
  return Math.round(candidates[0]?.scrollTop || 0);
})
")
echo "   Final scroll position: $FINAL_SCROLL"

# Take final screenshot
playwright-cli screenshot --filename=mobile-scroll-final.png

# Close browser
playwright-cli close

# Calculate delta
DELTA=$((FINAL_SCROLL - INITIAL_SCROLL))
if [ ${DELTA#-} -le 10 ]; then
    echo "✅ Mobile sheet scroll lock test passed!"
    echo "   Scroll delta: ${DELTA}px (within tolerance)"
else
    echo "⚠️  Scroll position changed significantly: ${DELTA}px"
fi

echo "   Screenshots saved: mobile-*.png"
