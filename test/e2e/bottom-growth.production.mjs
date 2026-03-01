const baseUrl = process.env.E2E_BASE_URL || 'https://chatwithme2mcp.lintao-mailbox.workers.dev';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('playwright is required. Install with: npm install --no-save playwright --legacy-peer-deps');
  }
}

async function waitForStreamingToFinish(page, timeoutMs = 120000) {
  const stopButtonSelector = 'button[aria-label="Stop"], button[aria-label="停止"]';
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
}

async function run() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('textarea', { timeout: 20000 });

    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill('请只返回一个 html 代码块，内部放一个高度 2200px 的 div 和可见文字。');
    await page.keyboard.press('Control+Enter');

    await waitForStreamingToFinish(page);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
      const scroller = Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const s = window.getComputedStyle(el);
          return (
            (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 8 &&
            el.clientHeight > 200 &&
            el.getBoundingClientRect().width > 500
          );
        })
        .sort((a, b) => {
          const sa = a.clientHeight * a.getBoundingClientRect().width;
          const sb = b.clientHeight * b.getBoundingClientRect().width;
          return sb - sa;
        })[0];

      if (!scroller) {
        return { ok: false, reason: 'no_scroller_found' };
      }

      scroller.scrollTop = scroller.scrollHeight;
      const before = {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      };

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const after = {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      };

      return {
        ok: true,
        growth: Math.round(after.scrollHeight - before.scrollHeight),
        topDelta: Math.round(after.scrollTop - before.scrollTop),
        before,
        after,
      };
    });

    await page.screenshot({ path: 'bottom-growth-production-check.png', fullPage: false });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error('E2E bottom-growth test failed:', error.message);
  process.exit(1);
});
