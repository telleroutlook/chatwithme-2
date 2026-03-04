/**
 * Mobile Safe Area E2E Test
 *
 * Tests that the mobile composer dock (chat input container) respects
 * safe-area insets and keeps interactive content above the home indicator.
 *
 * iPhone 13 viewport: 390x844
 * iPhone 13 safe area inset bottom: 34px (home indicator)
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
 * Get mobile composer dock metrics including safe-area padding.
 */
async function getComposerDockMetrics(page) {
  return await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    if (!textarea) return null;

    // ChatPane composer dock uses a border-top + safe-area padding container.
    const dock = textarea.closest("div.border-t");
    if (!dock) return null;

    const rect = dock.getBoundingClientRect();
    const style = window.getComputedStyle(dock);
    const inlinePaddingBottom = dock instanceof HTMLElement ? dock.style.paddingBottom : "";
    const computedPaddingBottom = parseFloat(style.paddingBottom) || 0;
    const hasSafeAreaExpr =
      inlinePaddingBottom.includes("safe-area-inset-bottom") ||
      inlinePaddingBottom.includes("--safe-area-inset-bottom");

    const rootStyle = window.getComputedStyle(document.documentElement);
    const safeAreaInsetBottom = rootStyle.getPropertyValue("--safe-area-inset-bottom");

    return {
      dockTop: Math.round(rect.top),
      dockBottom: Math.round(rect.bottom),
      dockHeight: Math.round(rect.height),
      dockWidth: Math.round(rect.width),
      inlinePaddingBottom,
      computedPaddingBottom,
      hasSafeAreaExpr,
      safeAreaInsetBottom,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      // Distance from dock bottom to viewport bottom (should be 0 in normal chat layout)
      bottomOffset: Math.round(window.innerHeight - rect.bottom)
    };
  });
}

/**
 * Check whether composer content area remains above safe area.
 */
async function checkSafeAreaCompliance(page, expectedSafeArea = HOME_INDICATOR_HEIGHT) {
  return await page.evaluate((safeArea) => {
    const textarea = document.querySelector("textarea");
    if (!textarea) return { compliant: false, reason: "Textarea not found" };

    const dock = textarea.closest("div.border-t");
    if (!dock) return { compliant: false, reason: "Composer dock not found" };

    const rect = dock.getBoundingClientRect();
    const style = window.getComputedStyle(dock);
    const paddingBottom = parseFloat(style.paddingBottom) || 0;

    const contentHeight = rect.height - paddingBottom;
    const hasSufficientPadding = paddingBottom >= safeArea - 2;
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

    // Get composer dock metrics
    const dockMetrics = await getComposerDockMetrics(page);
    console.log("Composer dock metrics:", JSON.stringify(dockMetrics, null, 2));

    // Core assertion: composer dock should be present on mobile
    assert(dockMetrics, "Composer dock not found on mobile viewport");

    // Assertion: composer dock should stay at viewport bottom
    assert(
      dockMetrics.bottomOffset === 0,
      `Composer dock should be at viewport bottom. Bottom offset: ${dockMetrics.bottomOffset}px`
    );

    // Check safe area compliance
    const safeAreaCheck = await checkSafeAreaCompliance(page, HOME_INDICATOR_HEIGHT);
    console.log("Safe area check:", JSON.stringify(safeAreaCheck, null, 2));

    // Hard gate: safe-area compliance must be true even when env() resolves to 0 in headless.
    // This prevents diagnostics from silently passing with latent production risk.
    assert(
      safeAreaCheck.compliant,
      `Composer dock does not respect safe area. ` +
        `Padding: ${safeAreaCheck.paddingBottom}px, ` +
        `Expected: >= ${HOME_INDICATOR_HEIGHT}px or content above safe area. ` +
        `Content above safe area: ${safeAreaCheck.contentAboveSafeArea}, ` +
        `Has safe-area expression: ${dockMetrics.hasSafeAreaExpr}, ` +
        `Inline padding: ${dockMetrics.inlinePaddingBottom || "<empty>"}`
    );

    // Additional check: send button should remain tappable above safe area.
    const sendButtonCheck = await page.evaluate((minPadding) => {
      const sendButton =
        document.querySelector('button[aria-label="Send"]') ||
        Array.from(document.querySelectorAll("button")).find((btn) =>
          btn.textContent?.trim().toLowerCase().includes("send")
        );
      if (!sendButton) return { ok: false, reason: "Send button not found" };

      const rect = sendButton.getBoundingClientRect();
      const touchTargetSize = Math.min(rect.width, rect.height);
      const bottomClearance = window.innerHeight - rect.bottom;
      const aboveSafeArea = bottomClearance >= minPadding;

      return {
        ok: aboveSafeArea && touchTargetSize >= 44,
        bottom: Math.round(rect.bottom),
        bottomClearance: Math.round(bottomClearance),
        touchTargetSize: Math.round(touchTargetSize),
        meetsMinTouchTarget: touchTargetSize >= 44,
        aboveSafeArea,
        minSafePadding: minPadding
      };
    }, MIN_SAFE_PADDING);

    console.log("Send button check:", JSON.stringify(sendButtonCheck, null, 2));
    assert(sendButtonCheck.ok, `Send button safe-area/touch target check failed: ${JSON.stringify(sendButtonCheck)}`);

    // Scroll the page and verify tab bar stays fixed
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await textarea.fill("Test message to trigger some UI activity");
    await page.waitForTimeout(500);

    // Check composer dock position after interaction
    const afterInteractionMetrics = await getComposerDockMetrics(page);
    assert(
      afterInteractionMetrics.bottomOffset === 0,
      `Composer dock position changed after interaction. Bottom offset: ${afterInteractionMetrics.bottomOffset}px`
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
          dockMetrics,
          safeAreaCheck,
          sendButtonCheck,
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
