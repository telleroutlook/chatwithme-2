/**
 * Mobile Safe Area E2E Test
 *
 * Tests that the bottom navigation (MobileTabBar) respects safe area insets
 * and doesn't overlap with the home indicator area on devices with notches.
 *
 * iPhone 13 viewport: 390x844
 * iPhone 13 safe area inset bottom: 34px (home indicator)
 *
 * NOTE: This test may initially FAIL since safe-area CSS may not be implemented yet.
 * This is intentional for TDD - the test defines the expected behavior.
 */

const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";

// iPhone 13 dimensions
const IPHONE_13_WIDTH = 390;
const IPHONE_13_HEIGHT = 844;
// iPhone 13+ home indicator height
const HOME_INDICATOR_HEIGHT = 34;
// Minimum safe padding from bottom
const MIN_SAFE_PADDING = 16;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "playwright is required for this test. Install it with: npm install --no-save playwright --legacy-peer-deps"
    );
  }
}

/**
 * Get MobileTabBar metrics including safe area padding
 */
async function getTabBarMetrics(page) {
  return await page.evaluate(() => {
    // Find the MobileTabBar - it has md:hidden class and is fixed at bottom
    const tabBar = document.querySelector("nav.fixed.bottom-0");
    if (!tabBar) return null;

    const rect = tabBar.getBoundingClientRect();
    const style = window.getComputedStyle(tabBar);

    // Check for safe-area-inset-bottom usage
    const hasSafeAreaPadding =
      style.paddingBottom.includes("env(safe-area-inset-bottom)") ||
      style.paddingBottom.includes("constant(safe-area-inset-bottom)");

    // Get actual computed padding (env() may not resolve in Playwright)
    const computedPaddingBottom = parseFloat(style.paddingBottom) || 0;

    // Check if tabBar uses CSS custom properties for safe area
    const rootStyle = window.getComputedStyle(document.documentElement);
    const safeAreaInsetBottom = rootStyle.getPropertyValue("--safe-area-inset-bottom");

    return {
      tabBarTop: Math.round(rect.top),
      tabBarBottom: Math.round(rect.bottom),
      tabBarHeight: Math.round(rect.height),
      tabBarWidth: Math.round(rect.width),
      computedPaddingBottom,
      hasSafeAreaPadding,
      safeAreaInsetBottom,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      // Distance from tabBar bottom to viewport bottom (should be 0 for fixed bottom)
      bottomOffset: Math.round(window.innerHeight - rect.bottom)
    };
  });
}

/**
 * Check if element is properly positioned above home indicator
 */
async function checkSafeAreaCompliance(page, expectedSafeArea = HOME_INDICATOR_HEIGHT) {
  return await page.evaluate((safeArea) => {
    const tabBar = document.querySelector("nav.fixed.bottom-0");
    if (!tabBar) return { compliant: false, reason: "TabBar not found" };

    const rect = tabBar.getBoundingClientRect();
    const style = window.getComputedStyle(tabBar);
    const paddingBottom = parseFloat(style.paddingBottom) || 0;

    // The tabBar should either:
    // 1. Have padding-bottom >= safeArea (ideal)
    // 2. Have its content area end above the safe area

    // Get the content area (tabBar height minus padding)
    const contentHeight = rect.height - paddingBottom;

    // Check if there's sufficient padding
    const hasSufficientPadding = paddingBottom >= safeArea - 2; // Allow 2px tolerance

    // Check if content is above safe area
    const contentBottom = rect.bottom - paddingBottom;
    const contentAboveSafeArea = (window.innerHeight - contentBottom) >= safeArea - 2;

    return {
      compliant: hasSufficientPadding || contentAboveSafeArea,
      hasSufficientPadding,
      contentAboveSafeArea,
      paddingBottom,
      contentHeight,
      contentBottom,
      safeArea,
      viewportHeight: window.innerHeight
    };
  }, expectedSafeArea);
}

async function run() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });

  // Use iPhone 13 viewport
  const page = await browser.newPage({
    viewport: { width: IPHONE_13_WIDTH, height: IPHONE_13_HEIGHT }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("textarea", { timeout: 20000 });

    // Wait for layout to stabilize
    await page.waitForTimeout(1000);

    // Get tab bar metrics
    const tabBarMetrics = await getTabBarMetrics(page);
    console.log("TabBar metrics:", JSON.stringify(tabBarMetrics, null, 2));

    // Core assertion: TabBar should be present on mobile
    assert(tabBarMetrics, "MobileTabBar not found on mobile viewport");

    // Assertion: TabBar should be fixed at bottom
    assert(
      tabBarMetrics.bottomOffset === 0,
      `TabBar should be at viewport bottom. Bottom offset: ${tabBarMetrics.bottomOffset}px`
    );

    // Check safe area compliance
    const safeAreaCheck = await checkSafeAreaCompliance(page, HOME_INDICATOR_HEIGHT);
    console.log("Safe area check:", JSON.stringify(safeAreaCheck, null, 2));

    // TDD: This assertion may initially fail if safe-area is not implemented
    // The test documents expected behavior for future implementation
    assert(
      safeAreaCheck.compliant,
      `MobileTabBar does not respect safe area. ` +
        `Padding: ${safeAreaCheck.paddingBottom}px, ` +
        `Expected: >= ${HOME_INDICATOR_HEIGHT}px. ` +
        `Content above safe area: ${safeAreaCheck.contentAboveSafeArea}`
    );

    // Additional check: Tab buttons should be tappable (not obscured by home indicator)
    const tabButtonsCheck = await page.evaluate((minPadding) => {
      const tabBar = document.querySelector("nav.fixed.bottom-0");
      if (!tabBar) return { ok: false, reason: "TabBar not found" };

      const buttons = tabBar.querySelectorAll("button");
      if (buttons.length === 0) return { ok: false, reason: "No buttons found" };

      const results = [];
      buttons.forEach((btn, index) => {
        const rect = btn.getBoundingClientRect();
        const style = window.getComputedStyle(btn);
        const touchTargetSize = Math.min(rect.width, rect.height);

        results.push({
          index,
          bottom: Math.round(rect.bottom),
          touchTargetSize: Math.round(touchTargetSize),
          // Apple HIG recommends 44pt minimum touch target
          meetsMinTouchTarget: touchTargetSize >= 44
        });
      });

      // Check if buttons are above safe area
      const maxButtonBottom = Math.max(...results.map((r) => r.bottom));
      const buttonsAboveSafeArea = (window.innerHeight - maxButtonBottom) >= minPadding;

      return {
        ok: buttonsAboveSafeArea,
        buttonCount: buttons.length,
        maxButtonBottom,
        buttonsAboveSafeArea,
        minSafePadding: minPadding,
        results
      };
    }, MIN_SAFE_PADDING);

    console.log("Tab buttons check:", JSON.stringify(tabButtonsCheck, null, 2));

    // Verify touch targets meet minimum size (Apple HIG: 44pt)
    tabButtonsCheck.results.forEach((btn) => {
      assert(
        btn.meetsMinTouchTarget,
        `Button ${btn.index} touch target too small: ${btn.touchTargetSize}px (min: 44px)`
      );
    });

    // Scroll the page and verify tab bar stays fixed
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await textarea.fill("Test message to trigger some UI activity");
    await page.waitForTimeout(500);

    // Check tab bar position after interaction
    const afterInteractionMetrics = await getTabBarMetrics(page);
    assert(
      afterInteractionMetrics.bottomOffset === 0,
      `TabBar position changed after interaction. Bottom offset: ${afterInteractionMetrics.bottomOffset}px`
    );

    await page.screenshot({
      path: "mobile-safe-area-production-check.png",
      fullPage: false
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          baseUrl,
          viewport: { width: IPHONE_13_WIDTH, height: IPHONE_13_HEIGHT },
          homeIndicatorHeight: HOME_INDICATOR_HEIGHT,
          tabBarMetrics,
          safeAreaCheck,
          tabButtonsCheck,
          screenshot: "mobile-safe-area-production-check.png"
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("E2E mobile-safe-area test failed:", error.message);
  process.exit(1);
});
