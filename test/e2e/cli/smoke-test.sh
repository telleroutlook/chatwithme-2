#!/bin/bash
# Smoke Test - Basic functionality check using Playwright CLI
# Usage: ./smoke-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
SESSION_ID="e2e-cli-smoke-$(date +%s)"

echo "🧪 Running Smoke Test against: $BASE_URL"
echo "   Session ID: $SESSION_ID"

# Open browser and navigate
echo "📍 Opening browser..."
playwright-cli open "$BASE_URL"

# Wait for page load
sleep 3

# Take initial screenshot
playwright-cli screenshot --filename=smoke-initial.png

# Get page snapshot to find textarea ref
echo "📋 Getting page snapshot..."
playwright-cli snapshot --filename=smoke-snapshot.yaml

# Find textarea ref from snapshot
TEXTAREA_REF=$(grep -A1 'textbox.*Type a message' smoke-snapshot.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -z "$TEXTAREA_REF" ]; then
    echo "❌ Could not find textarea element"
    playwright-cli close
    exit 1
fi

echo "📝 Found textarea with ref: $TEXTAREA_REF"

# Type test message
echo "⌨️  Typing test message..."
playwright-cli fill "$TEXTAREA_REF" "E2E CLI smoke test message"

# Wait a moment for UI to update
sleep 1

# Find Send button (should be enabled now)
playwright-cli snapshot --filename=smoke-after-fill.yaml
SEND_REF=$(grep -B1 'button "Send"' smoke-after-fill.yaml | grep -oP 'ref=\K[^]]+' | head -1)

if [ -z "$SEND_REF" ]; then
    echo "❌ Could not find Send button"
    playwright-cli close
    exit 1
fi

echo "📤 Found Send button with ref: $SEND_REF"

# Click send
echo "📧 Sending message..."
playwright-cli click "$SEND_REF"

# Wait for response
echo "⏳ Waiting for AI response..."
sleep 5

# Take final screenshot
playwright-cli screenshot --filename=smoke-final.png

# Close browser
playwright-cli close

echo "✅ Smoke test passed!"
echo "   Screenshots saved: smoke-initial.png, smoke-final.png"
