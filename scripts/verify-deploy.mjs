import { readFile } from "node:fs/promises";

const INDEX_ASSET_REGEX = /(?:src|href)="(\/assets\/[^"\s]+\.(?:js|css))"/g;

function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

async function parseWranglerHost() {
  try {
    const raw = await readFile("wrangler.jsonc", "utf8");
    const parsed = JSON.parse(raw);
    const host = parsed?.vars?.HOST;
    if (typeof host === "string" && host.trim()) {
      return normalizeBaseUrl(`https://${host.trim()}`);
    }
  } catch {
    // Ignore parse errors; caller falls back to env/argv.
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache"
    },
    redirect: "follow"
  });
  const text = await response.text();
  return { response, text };
}

async function fetchHead(url) {
  let response = await fetch(url, {
    method: "HEAD",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache"
    },
    redirect: "follow"
  });

  if (response.status === 405 || response.status === 501) {
    response = await fetch(url, {
      method: "GET",
      headers: {
        range: "bytes=0-0",
        "cache-control": "no-cache",
        pragma: "no-cache"
      },
      redirect: "follow"
    });
  }

  return response;
}

function parseAssetsFromIndex(html) {
  const assets = new Set();
  let match = null;
  while ((match = INDEX_ASSET_REGEX.exec(html)) !== null) {
    assets.add(match[1]);
  }
  return [...assets];
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function looksLikeJavascript(contentType) {
  return /(?:javascript|ecmascript|application\/x-javascript|text\/javascript)/i.test(contentType);
}

async function verifyBaseUrl(baseUrl) {
  console.log(`\n[verify] Checking deployment: ${baseUrl}`);

  const indexUrl = `${baseUrl}/`;
  const { response: indexResponse, text: indexHtml } = await fetchText(indexUrl);
  const indexContentType = indexResponse.headers.get("content-type") || "";

  expect(indexResponse.ok, `index request failed (${indexResponse.status}) at ${indexUrl}`);
  expect(
    /text\/html/i.test(indexContentType),
    `index content-type must be text/html, got: ${indexContentType || "unknown"}`
  );

  const assets = parseAssetsFromIndex(indexHtml);
  const jsAssets = assets.filter((asset) => asset.endsWith(".js"));
  const cssAssets = assets.filter((asset) => asset.endsWith(".css"));

  expect(jsAssets.length > 0, "no JS assets were discovered in index.html");
  expect(cssAssets.length > 0, "no CSS assets were discovered in index.html");

  for (const assetPath of assets) {
    const assetUrl = `${baseUrl}${assetPath}`;
    const assetResponse = await fetchHead(assetUrl);
    const contentType = assetResponse.headers.get("content-type") || "";

    expect(assetResponse.ok, `asset request failed (${assetResponse.status}) for ${assetPath}`);

    if (assetPath.endsWith(".js")) {
      expect(
        looksLikeJavascript(contentType),
        `JS asset ${assetPath} returned unexpected content-type: ${contentType || "unknown"}`
      );
    }

    if (assetPath.endsWith(".css")) {
      expect(
        /text\/css/i.test(contentType),
        `CSS asset ${assetPath} returned unexpected content-type: ${contentType || "unknown"}`
      );
    }
  }

  console.log(
    `[verify] OK: ${assets.length} assets checked (${jsAssets.length} js, ${cssAssets.length} css)`
  );
}

async function main() {
  const argUrls = process.argv.slice(2).map(normalizeBaseUrl).filter(Boolean);
  const envUrls = (process.env.DEPLOY_VERIFY_URLS || "")
    .split(",")
    .map(normalizeBaseUrl)
    .filter(Boolean);
  const wranglerUrl = await parseWranglerHost();

  const urlSet = new Set([...argUrls, ...envUrls]);
  if (urlSet.size === 0 && wranglerUrl) {
    urlSet.add(wranglerUrl);
  }

  expect(
    urlSet.size > 0,
    "no deployment URLs provided. Set DEPLOY_VERIFY_URLS or ensure wrangler.jsonc vars.HOST exists."
  );

  for (const baseUrl of urlSet) {
    await verifyBaseUrl(baseUrl);
  }

  console.log("\n[verify] Deployment verification passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[verify] Deployment verification failed: ${message}`);
  process.exit(1);
});
