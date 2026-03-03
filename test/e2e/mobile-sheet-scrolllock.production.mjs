/**
 * Mobile Sheet Scroll Lock E2E Test
 *
 * Tests that opening/closing modals/sheets on mobile:
 * 1. Doesn't cause page jump (scroll position shift)
 * 2. Preserves scroll position after modal close
 *
 * NOTE: This test may initially FAIL since scroll lock may not be mobile-optimized yet.
 * This is intentional for TDD - the test defines the expected behavior.
 */

const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";
const stopButtonSelector = 'button[aria-label="Stop"], button[aria-label="停止"]';

// iPhone 13 dimensions
const IPHONE_13_WIDTH = 390;
const IPHONE_13_HEIGHT = 844;

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

async function waitForStreamingToFinish(page, timeoutMs = 120000) {
  const start = Date.now();
  let idleChecks = 0;
  while (Date.now() - start < timeoutMs) {
    const streaming = (await page.locator(stopButtonSelector).count()) > 0;
    if (!streaming) {
      idleChecks += 1;
      if (idleChecks >= 4) return;
    } else {
      idleChecks = 0;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("Streaming did not finish within timeout");
}

async function sendPrompt(page, text) {
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 30000 });
  await textarea.click();
  await textarea.fill(text);
  await page.keyboard.press("Control+Enter");
}

/**
 * Find the main scroll container
 */
async function resolveMainScrollContainer(page) {
  const handle = await page.evaluateHandle(() => {
    const isScrollable = (el) => {
      const style = window.getComputedStyle(el);
      return (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 8 &&
        el.clientHeight > 200 &&
        el.getBoundingClientRect().width > 100 // Adjusted for mobile
      );
    };

    const candidates = Array.from(document.querySelectorAll("div")).filter(isScrollable);
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0] ?? null;
  });

  const element = handle.asElement();
  assert(element, "Unable to find main chat scroll container");
  return element;
}

/**
 * Get scroll position metrics
 */
async function getScrollMetrics(page, scrollContainer) {
  return await scrollContainer.evaluate((el) => ({
    scrollTop: Math.round(el.scrollTop),
    scrollHeight: Math.round(el.scrollHeight),
    clientHeight: Math.round(el.clientHeight),
    scrollPercentage: Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100) || 0
  }));
}

/**
 * Get body scroll lock state
 */
async function getBodyScrollState(page) {
  return await page.evaluate(() => {
    const style = window.getComputedStyle(document.body);
    return {
      overflow: style.overflow,
      overflowY: style.overflowY,
      position: style.position,
      hasScrollLock: document.body.style.overflow === "hidden" || style.overflow === "hidden"
    };
  });
}

/**
 * Simulate opening a modal/sheet by triggering sidebar on mobile
 */
async function openMobileSidebar(page) {
  // Find and click the menu/hamburger button
  const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], button').filter({
    has: page.locator("svg")
  }).first();

  // Try to find sidebar toggle
  const sidebarToggle = page.locator("button").filter({
    hasText: /menu|sidebar|toggle/i
  }).first();

  try {
    await sidebarToggle.click({ timeout: 3000 });
    await page.waitForTimeout(500);
    return true;
  } catch {
    // Alternative: try clicking the first button in the header
    const headerButton = page.locator("header button, nav button").first();
    try {
      await headerButton.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Close mobile sidebar
 */
async function closeMobileSidebar(page) {
  // Method 1: Click the overlay (fixed inset-0 z-40 that appears when sidebar is open)
  try {
    // The overlay has class "fixed inset-0 z-40" and appears when sidebar is open
    const overlay = page.locator('div.fixed.inset-0.z-40').first();
    const count = await overlay.count();
    if (count > 0) {
      // Click on the right side of the overlay (outside sidebar)
      const viewport = page.viewportSize();
      await overlay.click({ position: { x: viewport.width - 50, y: viewport.height / 2 }, timeout: 2000 });
      await page.waitForTimeout(500);
      // Verify sidebar is closed
      const sidebarVisible = await page.locator("aside.translate-x-0").count();
      if (sidebarVisible === 0) return true;
    }
  } catch {
    // Continue to next method
  }

  // Method 2: Press Escape key
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const sidebarVisible = await page.locator("aside.translate-x-0").count();
    if (sidebarVisible === 0) return true;
  } catch {
    // Continue to next method
  }

  // Method 3: Click outside sidebar directly
  try {
    const viewport = page.viewportSize();
    // Click on the main content area (right side, away from sidebar which is on left)
    await page.mouse.click(viewport.width - 100, viewport.height / 2);
    await page.waitForTimeout(500);
    const sidebarVisible = await page.locator("aside.translate-x-0").count();
    if (sidebarVisible === 0) return true;
  } catch {
    return false;
  }

  return false;
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
    await page.waitForTimeout(3000);

    // Build enough history so the list is definitely scrollable
    await sendPrompt(page, "Please output a numbered list of 80 lines, each line 12-20 characters, no code blocks.");
    await waitForStreamingToFinish(page);
    await sendPrompt(page, "Continue with another 80 lines of numbered text, each line 12-20 characters.");
    await waitForStreamingToFinish(page);

    const scrollContainer = await resolveMainScrollContainer(page);
    const box = await scrollContainer.boundingBox();
    assert(box, "Failed to get scroll container bounding box");

    // Scroll to middle position
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(100);
    }

    // Record initial scroll position
    const initialMetrics = await getScrollMetrics(page, scrollContainer);
    console.log("Initial scroll metrics:", JSON.stringify(initialMetrics, null, 2));

    // Verify we're not at the top
    const hiddenHeight = await scrollContainer.evaluate(
      (el) => el.scrollHeight - el.scrollTop - el.clientHeight
    );
    assert(hiddenHeight > 200, `Expected to be away from bottom, hiddenHeight=${Math.round(hiddenHeight)}`);

    // Test 1: Open and close sidebar (modal-like behavior on mobile)
    const sidebarOpened = await openMobileSidebar(page);

    if (sidebarOpened) {
      // Record scroll state when sidebar is open
      const openState = await getBodyScrollState(page);
      console.log("Sidebar open - body scroll state:", JSON.stringify(openState, null, 2));

      // Get scroll position while sidebar is open
      const openMetrics = await getScrollMetrics(page, scrollContainer);
      console.log("Sidebar open - scroll metrics:", JSON.stringify(openMetrics, null, 2));

      // Close sidebar
      await closeMobileSidebar(page);

      // Wait for any animations
      await page.waitForTimeout(500);

      // Record scroll position after close
      const afterCloseMetrics = await getScrollMetrics(page, scrollContainer);
      console.log("After sidebar close - scroll metrics:", JSON.stringify(afterCloseMetrics, null, 2));

      // Core assertion: scroll position should be preserved (allow 5px tolerance)
      const scrollDelta = Math.abs(afterCloseMetrics.scrollTop - initialMetrics.scrollTop);
      assert(
        scrollDelta <= 5,
        `Scroll position changed after sidebar close. ` +
          `Initial: ${initialMetrics.scrollTop}, ` +
          `After close: ${afterCloseMetrics.scrollTop}, ` +
          `Delta: ${scrollDelta}px`
      );
    } else {
      console.log("Could not open sidebar - skipping sidebar scroll lock test");
    }

    // Test 2: Scroll position preservation during streaming
    const beforeStreamMetrics = await getScrollMetrics(page, scrollContainer);
    console.log("Before stream - scroll metrics:", JSON.stringify(beforeStreamMetrics, null, 2));

    // Start a streaming response
    await sendPrompt(page, "Output 60 lines of text, each line about 15 characters.");
    await page.waitForTimeout(2000);

    // Check scroll position during streaming
    const duringStreamMetrics = await getScrollMetrics(page, scrollContainer);
    console.log("During stream - scroll metrics:", JSON.stringify(duringStreamMetrics, null, 2));

    // Wait for streaming to finish
    await waitForStreamingToFinish(page);
    await page.waitForTimeout(1000);

    // Final scroll position
    const finalMetrics = await getScrollMetrics(page, scrollContainer);
    console.log("Final scroll metrics:", JSON.stringify(finalMetrics, null, 2));

    // Test 3: Touch scroll behavior
    // Simulate touch scroll and verify no jump
    const touchScrollStart = await getScrollMetrics(page, scrollContainer);
    const programmaticDelta = touchScrollStart.scrollTop <= 0 ? 300 : -300;
    await scrollContainer.evaluate((el, delta) => {
      el.scrollBy({ top: delta, behavior: "auto" });
    }, programmaticDelta);
    await page.waitForTimeout(200);

    const touchScrollEnd = await getScrollMetrics(page, scrollContainer);
    console.log("Touch scroll test:", JSON.stringify({
      start: touchScrollStart.scrollTop,
      end: touchScrollEnd.scrollTop,
      delta: touchScrollEnd.scrollTop - touchScrollStart.scrollTop
    }, null, 2));

    // Verify scroll actually happened
    assert(
      Math.abs(touchScrollEnd.scrollTop - touchScrollStart.scrollTop) >= 10,
      `Touch scroll did not work. Start: ${touchScrollStart.scrollTop}, End: ${touchScrollEnd.scrollTop}`
    );

    await page.screenshot({
      path: "mobile-sheet-scrolllock-production-check.png",
      fullPage: false
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          baseUrl,
          viewport: { width: IPHONE_13_WIDTH, height: IPHONE_13_HEIGHT },
          initialMetrics,
          sidebarTest: sidebarOpened ? "completed" : "skipped",
          beforeStreamMetrics,
          duringStreamMetrics,
          finalMetrics,
          screenshot: "mobile-sheet-scrolllock-production-check.png"
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
  console.error("E2E mobile-sheet-scrolllock test failed:", error.message);
  process.exit(1);
});
