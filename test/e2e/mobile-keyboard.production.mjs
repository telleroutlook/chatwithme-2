/**
 * Mobile Keyboard E2E Test
 *
 * Tests that the composer remains visible when the virtual keyboard opens.
 * Uses viewport resizing to simulate keyboard appearance on mobile devices.
 *
 * iPhone 13 viewport: 390x844
 * Typical iOS keyboard height: ~336px
 */

const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";

// iPhone 13 dimensions
const IPHONE_13_WIDTH = 390;
const IPHONE_13_HEIGHT = 844;
// Approximate iOS keyboard height
const IOS_KEYBOARD_HEIGHT = 336;

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
 * Simulate keyboard opening by reducing viewport height
 */
async function simulateKeyboardOpen(page, keyboardHeight = IOS_KEYBOARD_HEIGHT) {
  const currentViewport = page.viewportSize();
  await page.setViewportSize({
    width: currentViewport.width,
    height: currentViewport.height - keyboardHeight
  });
}

/**
 * Simulate keyboard closing by restoring viewport height
 */
async function simulateKeyboardClose(page, originalHeight) {
  const currentViewport = page.viewportSize();
  await page.setViewportSize({
    width: currentViewport.width,
    height: originalHeight
  });
}

/**
 * Check if an element is visible in the current viewport
 */
async function isElementInViewport(page, selector) {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= viewportHeight &&
      rect.right <= viewportWidth
    );
  }, selector);
}

/**
 * Get the composer/textarea bounding rect relative to viewport
 */
async function getComposerMetrics(page) {
  return await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    if (!textarea) return null;

    const rect = textarea.getBoundingClientRect();
    const composerContainer = textarea.closest("[data-composer]") || textarea.parentElement;
    const containerRect = composerContainer?.getBoundingClientRect();

    return {
      textareaTop: Math.round(rect.top),
      textareaBottom: Math.round(rect.bottom),
      textareaHeight: Math.round(rect.height),
      containerTop: containerRect ? Math.round(containerRect.top) : null,
      containerBottom: containerRect ? Math.round(containerRect.bottom) : null,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
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

    // Get initial metrics
    const initialMetrics = await getComposerMetrics(page);
    assert(initialMetrics, "Could not get initial composer metrics");
    console.log("Initial metrics:", JSON.stringify(initialMetrics, null, 2));

    // Focus the textarea (simulates user tap)
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await page.waitForTimeout(500);

    // Simulate keyboard opening
    await simulateKeyboardOpen(page, IOS_KEYBOARD_HEIGHT);
    await page.waitForTimeout(500);

    // Get metrics with keyboard "open"
    const keyboardOpenMetrics = await getComposerMetrics(page);
    assert(keyboardOpenMetrics, "Could not get keyboard-open composer metrics");
    console.log("Keyboard open metrics:", JSON.stringify(keyboardOpenMetrics, null, 2));

    // Core assertion: textarea should still be visible in viewport
    const textareaInViewport = await isElementInViewport(page, "textarea");
    assert(
      textareaInViewport,
      `Textarea not in viewport when keyboard is open. Bottom: ${keyboardOpenMetrics.textareaBottom}, Viewport: ${keyboardOpenMetrics.viewportHeight}`
    );

    // Additional assertion: textarea bottom should have some margin from viewport bottom
    // This ensures the composer isn't flush against the keyboard
    const bottomMargin = keyboardOpenMetrics.viewportHeight - keyboardOpenMetrics.textareaBottom;
    assert(
      bottomMargin >= 0,
      `Textarea extends below viewport. Bottom margin: ${bottomMargin}px`
    );

    // Check that the composer container (if exists) is also visible
    if (keyboardOpenMetrics.containerBottom !== null) {
      const containerInViewport = keyboardOpenMetrics.containerBottom <= keyboardOpenMetrics.viewportHeight;
      assert(
        containerInViewport,
        `Composer container not fully visible. Container bottom: ${keyboardOpenMetrics.containerBottom}, Viewport: ${keyboardOpenMetrics.viewportHeight}`
      );
    }

    // Test typing in the textarea with keyboard "open"
    await textarea.fill("Testing keyboard visibility on mobile");
    await page.waitForTimeout(300);

    // Verify textarea is still visible after typing
    const afterTypingMetrics = await getComposerMetrics(page);
    const stillVisible = afterTypingMetrics.textareaBottom <= afterTypingMetrics.viewportHeight;
    assert(
      stillVisible,
      `Textarea not visible after typing. Bottom: ${afterTypingMetrics.textareaBottom}, Viewport: ${afterTypingMetrics.viewportHeight}`
    );

    // Simulate keyboard closing
    await simulateKeyboardClose(page, IPHONE_13_HEIGHT);
    await page.waitForTimeout(500);

    // Verify textarea is still visible after keyboard closes
    const keyboardClosedMetrics = await getComposerMetrics(page);
    const visibleAfterClose = keyboardClosedMetrics.textareaBottom <= keyboardClosedMetrics.viewportHeight;
    assert(
      visibleAfterClose,
      `Textarea not visible after keyboard close. Bottom: ${keyboardClosedMetrics.textareaBottom}, Viewport: ${keyboardClosedMetrics.viewportHeight}`
    );

    await page.screenshot({
      path: "mobile-keyboard-production-check.png",
      fullPage: false
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          baseUrl,
          viewport: { width: IPHONE_13_WIDTH, height: IPHONE_13_HEIGHT },
          keyboardHeight: IOS_KEYBOARD_HEIGHT,
          initialMetrics,
          keyboardOpenMetrics,
          afterTypingMetrics,
          keyboardClosedMetrics,
          screenshot: "mobile-keyboard-production-check.png"
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
  console.error("E2E mobile-keyboard test failed:", error.message);
  process.exit(1);
});
