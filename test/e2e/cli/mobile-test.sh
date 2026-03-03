#!/bin/bash
# Mobile Keyboard Test - Verify composer visibility with virtual keyboard
# Simulates keyboard opening by resizing viewport
# Usage: ./mobile-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
IPHONE_WIDTH=390
IPHONE_HEIGHT=844
KEYBOARD_HEIGHT=336

echo "📱 Running Mobile Keyboard Test against: $BASE_URL"
echo "   Viewport: ${IPHONE_WIDTH}x${IPHONE_HEIGHT}"
echo "   Simulated keyboard height: ${KEYBOARD_HEIGHT}px"

# Open browser with mobile viewport
echo "📍 Opening browser with mobile viewport..."
playwright-cli open "$BASE_URL"
playwright-cli resize "$IPHONE_WIDTH" "$IPHONE_HEIGHT"

# Wait for page load
sleep 3

# Get initial metrics
echo "📊 Capturing initial metrics..."
playwright-cli snapshot --filename=mobile-initial.yaml

# Find textarea
TEXTAREA_REF=$(grep -A1 'textbox.*Type a message' mobile-initial.yaml | grep -oP 'ref=\K[^]]+' | head -1)
if [ -z "$TEXTAREA_REF" ]; then
    echo "❌ Could not find textarea"
    playwright-cli close
    exit 1
fi

# Focus textarea (simulates tap)
echo "👆 Focusing textarea..."
playwright-cli click "$TEXTAREA_REF"
sleep 1

# Take screenshot before keyboard
playwright-cli screenshot --filename=mobile-before-keyboard.png

# Simulate keyboard opening by reducing viewport height
echo "⌨️  Simulating keyboard open..."
PLAYWRIGHT_CLI_SESSION=mobile playwright-cli resize "$IPHONE_WIDTH" $((IPHONE_HEIGHT - KEYBOARD_HEIGHT))
sleep 1

# Take screenshot with "keyboard open"
playwright-cli screenshot --filename=mobile-keyboard-open.png

# Check if textarea is still visible using eval
echo "🔍 Checking textarea visibility..."
VISIBILITY_CHECK=$(playwright-cli eval "
(() => {
  const textarea = document.querySelector('textarea');
  if (!textarea) return { visible: false, reason: 'textarea_not_found' };
  const rect = textarea.getBoundingClientRect();
  const vh = window.innerHeight;
  return {
    visible: rect.bottom <= vh,
    textareaTop: Math.round(rect.top),
    textareaBottom: Math.round(rect.bottom),
    viewportHeight: vh,
    margin: Math.round(vh - rect.bottom)
  };
})()
")

echo "   Visibility check: $VISIBILITY_CHECK"

# Type test message
echo "⌨️  Typing test message..."
playwright-cli fill "$TEXTAREA_REF" "Testing keyboard visibility on mobile"
sleep 1

# Take screenshot after typing
playwright-cli screenshot --filename=mobile-after-typing.png

# Simulate keyboard closing
echo "📉 Simulating keyboard close..."
playwright-cli resize "$IPHONE_WIDTH" "$IPHONE_HEIGHT"
sleep 1

# Final screenshot
playwright-cli screenshot --filename=mobile-keyboard-closed.png

# Close browser
playwright-cli close

echo "✅ Mobile keyboard test completed!"
echo "   Screenshots saved: mobile-*.png"
