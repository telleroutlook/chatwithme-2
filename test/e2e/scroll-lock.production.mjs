const baseUrl = process.env.E2E_BASE_URL || "https://chatwithme2mcp.lintao-mailbox.workers.dev";
const stopButtonSelector = 'button[aria-label="Stop"], button[aria-label="停止"]';

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

async function resolveMainScrollContainer(page) {
  const handle = await page.evaluateHandle(() => {
    const isScrollable = (el) => {
      const style = window.getComputedStyle(el);
      return (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 8 &&
        el.clientHeight > 280 &&
        el.getBoundingClientRect().width > 500
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

async function monitorNoJump(page, scrollContainer, monitorMs = 15000) {
  const initialTop = await scrollContainer.evaluate((el) => el.scrollTop);
  let maxTop = initialTop;
  const start = Date.now();

  while (Date.now() - start < monitorMs) {
    const currentTop = await scrollContainer.evaluate((el) => el.scrollTop);
    if (currentTop > maxTop) {
      maxTop = currentTop;
    }
    await page.waitForTimeout(250);
  }

  return {
    initialTop: Math.round(initialTop),
    maxTop: Math.round(maxTop),
    jumpDelta: Math.round(maxTop - initialTop)
  };
}

async function run() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);

    // Build enough history so the list is definitely scrollable.
    await sendPrompt(page, "请输出一段 120 行的编号文本，每行 12~20 个字，不要代码块。");
    await waitForStreamingToFinish(page);
    await sendPrompt(page, "继续输出一段 120 行的编号文本，每行 12~20 个字，不要代码块。");
    await waitForStreamingToFinish(page);

    const scrollContainer = await resolveMainScrollContainer(page);
    const box = await scrollContainer.boundingBox();
    assert(box, "Failed to get scroll container bounding box");

    // User scrolls up with mouse wheel.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(120);
    }

    const hiddenHeight = await scrollContainer.evaluate(
      (el) => el.scrollHeight - el.scrollTop - el.clientHeight
    );
    assert(hiddenHeight > 300, `Expected to be away from bottom, hiddenHeight=${Math.round(hiddenHeight)}`);

    // Round 1: long streaming response should not pull to bottom.
    await sendPrompt(page, "再输出 180 行内容，每行约 20 字，保持连续文本。");
    const round1 = await monitorNoJump(page, scrollContainer, 12000);
    await waitForStreamingToFinish(page);

    // Round 2: another consecutive response, still no auto jump.
    await sendPrompt(page, "继续输出 160 行内容，每行约 20 字，保持连续文本。");
    const round2 = await monitorNoJump(page, scrollContainer, 12000);
    await waitForStreamingToFinish(page);

    const threshold = 80;
    assert(
      round1.jumpDelta <= threshold,
      `Auto-scroll jump detected in round1, delta=${round1.jumpDelta}px`
    );
    assert(
      round2.jumpDelta <= threshold,
      `Auto-scroll jump detected in round2, delta=${round2.jumpDelta}px`
    );

    await page.screenshot({
      path: "scroll-lock-production-check.png",
      fullPage: false
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          baseUrl,
          hiddenHeight: Math.round(hiddenHeight),
          round1,
          round2,
          screenshot: "scroll-lock-production-check.png"
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
  console.error("E2E scroll-lock test failed:", error.message);
  process.exit(1);
});
