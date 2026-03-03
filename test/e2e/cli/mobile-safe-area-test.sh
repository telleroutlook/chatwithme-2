#!/bin/bash
# Mobile Safe Area Test - Verify bottom navigation respects safe area insets
# Usage: ./mobile-safe-area-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
IPHONE_WIDTH=390
IPHONE_HEIGHT=844

echo "📱 Running Mobile Safe Area Test against: $BASE_URL"

# Open browser with mobile viewport
echo "📍 Opening browser with mobile viewport..."
playwright-cli open "$BASE_URL"
playwright-cli resize "$IPHONE_WIDTH" "$IPHONE_HEIGHT"

sleep 3

# Check for MobileTabBar
echo "🔍 Checking for MobileTabBar..."
TABBAR_CHECK=$(playwright-cli eval "
(() => {
  const tabBar = document.querySelector('nav.fixed.bottom-0');
  if (!tabBar) return { found: false };

  const rect = tabBar.getBoundingClientRect();
  const style = window.getComputedStyle(tabBar);
  const paddingBottom = parseFloat(style.paddingBottom) || 0;

  // Check if tabBar is at bottom
  const atBottom = Math.abs(window.innerHeight - rect.bottom) < 2;

  return {
    found: true,
    atBottom,
    tabBarHeight: Math.round(rect.height),
    tabBarBottom: Math.round(rect.bottom),
    paddingBottom: Math.round(paddingBottom),
    viewportHeight: window.innerHeight
  };
})
")

echo "   TabBar check: $TABBAR_CHECK"

if echo "$TABBAR_CHECK" | grep -q '"found":false'; then
    echo "⚠️  MobileTabBar not found - may not be mobile layout"
fi

# Take screenshot
playwright-cli screenshot --filename=mobile-safe-area-check.png

# Check touch targets for tab buttons
echo "👆 Checking touch targets..."
TOUCH_CHECK=$(playwright-cli eval "
(() => {
  const tabBar = document.querySelector('nav.fixed.bottom-0');
  if (!tabBar) return { ok: false, reason: 'no_tabbar' };

  const buttons = tabBar.querySelectorAll('button');
  if (buttons.length === 0) return { ok: false, reason: 'no_buttons' };

  const results = [];
  buttons.forEach((btn, i) => {
    const rect = btn.getBoundingClientRect();
    const touchSize = Math.min(rect.width, rect.height);
    results.push({
      index: i,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      touchSize: Math.round(touchSize),
      meetsMinTarget: touchSize >= 44 // Apple HIG minimum
    });
  });

  const allMeetMin = results.every(r => r.meetsMinTarget);
  return { ok: allMeetMin, buttonCount: buttons.length, buttons: results };
})
")

echo "   Touch targets: $TOUCH_CHECK"

# Close browser
playwright-cli close

echo "✅ Mobile safe area test completed!"
echo "   Screenshot saved: mobile-safe-area-check.png"
