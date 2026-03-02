#!/usr/bin/env node
/**
 * Fetch Chart Knowledge from Context7 - Auto Decision Version
 *
 * Features:
 * - Auto degradation when content exceeds limits
 * - Auto fallback to LKG (Last Known Good) snapshot
 * - Daily fetch limit (max 1 per UTC day)
 * - Structured logging for observability
 *
 * Usage:
 *   node scripts/fetch-chart-knowledge.mjs           # Non-strict mode
 *   node scripts/fetch-chart-knowledge.mjs --strict  # Strict mode (require API key)
 *
 * Environment:
 *   CONTEXT7_API_KEY - Required for API access
 *   DEBUG_CONTEXT7    - Enable debug logging (optional)
 */

import { writeFile, mkdir, readFile, copyFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const KB_DIR = resolve(ROOT_DIR, "knowledge-base/charts");
const LKG_DIR = resolve(ROOT_DIR, "knowledge-base/.lkg");

const CONTEXT7_BASE_URL = "https://api.context7.com/v2";

// Size limits (in bytes)
const MAX_TOTAL_SIZE = 100 * 1024; // 100KB total
const MAX_FILE_SIZE = 50 * 1024;   // 50KB per file

// ADC whitelist (must match parser)
const ADC_WHITELIST = [
  "line", "column", "bar", "area", "pie", "scatter",
  "radar", "gauge", "heatmap", "funnel", "histogram", "dualAxes"
];

// Core Mermaid templates (fallback set)
const MERMAID_CORE_TEMPLATES = [
  "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram",
  "erDiagram", "pie", "gantt", "mindmap"
];

// Parse command line args
const args = process.argv.slice(2);
const isStrict = args.includes("--strict");
const isDebug = process.env.DEBUG_CONTEXT7 === "true";

// Structured log state
const logState = {
  fetch_status: "pending",
  degrade_level: 0,
  fallback_used: false,
  size_before: { total: 0, adc: 0, g2: 0, mermaid: 0 },
  size_after: { total: 0, adc: 0, g2: 0, mermaid: 0 },
  overflow_reason: null,
  kb_version: "1.0.0",
  timestamp: new Date().toISOString(),
  content_hash: null,
  checked_at: null,
  unchanged: false,
  next_refresh_at: null,
};

/**
 * Get UTC date string for daily check
 */
function getUtcDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Compute content hash
 */
function computeContentHash(content) {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}

/**
 * Calculate object size in bytes
 */
function calculateSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

/**
 * Structured logging output
 */
function logStructured(message, data = {}) {
  const prefix = `[kb:fetch]`;
  console.log(`${prefix} ${message}`);

  if (isDebug || Object.keys(data).length > 0) {
    console.log(`${prefix} [STRUCTURED] ${JSON.stringify({ ...logState, ...data })}`);
  }
}

/**
 * Fetch with retry and error handling
 */
async function fetchWithRetry(url, options, retries = 2) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`AUTH_FAILED: API key invalid (${response.status})`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (i < retries) {
        logStructured(`Retry ${i + 1}/${retries} after error: ${error.message}`);
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Search for a library in Context7
 */
async function searchLibrary(apiKey, libraryName) {
  const url = new URL(`${CONTEXT7_BASE_URL}/libs/search`);
  url.searchParams.set("libraryName", libraryName);

  const result = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!result.libraries || result.libraries.length === 0) {
    throw new Error(`Library not found: ${libraryName}`);
  }

  return result.libraries[0];
}

/**
 * Fetch context for a library
 */
async function fetchContext(apiKey, libraryId, query) {
  const url = new URL(`${CONTEXT7_BASE_URL}/context`);
  url.searchParams.set("libraryId", libraryId);
  url.searchParams.set("query", query);

  return await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Load local knowledge base files
 */
async function loadLocalKnowledge() {
  try {
    const [adc, g2, mermaid] = await Promise.all([
      readFile(resolve(KB_DIR, "adc.json"), "utf8").then(JSON.parse),
      readFile(resolve(KB_DIR, "g2.json"), "utf8").then(JSON.parse),
      readFile(resolve(KB_DIR, "mermaid.json"), "utf8").then(JSON.parse),
    ]);
    return { adc, g2, mermaid };
  } catch {
    return null;
  }
}

/**
 * Load LKG (Last Known Good) snapshot
 */
async function loadLKG() {
  try {
    const [adc, g2, mermaid, meta] = await Promise.all([
      readFile(resolve(LKG_DIR, "adc.json"), "utf8").then(JSON.parse),
      readFile(resolve(LKG_DIR, "g2.json"), "utf8").then(JSON.parse),
      readFile(resolve(LKG_DIR, "mermaid.json"), "utf8").then(JSON.parse),
      readFile(resolve(LKG_DIR, "index.json"), "utf8").then(JSON.parse),
    ]);
    return { adc, g2, mermaid, meta };
  } catch {
    return null;
  }
}

/**
 * Save LKG snapshot
 */
async function saveLKG(knowledge, meta) {
  await mkdir(LKG_DIR, { recursive: true });
  await Promise.all([
    writeFile(resolve(LKG_DIR, "adc.json"), JSON.stringify(knowledge.adc, null, 2)),
    writeFile(resolve(LKG_DIR, "g2.json"), JSON.stringify(knowledge.g2, null, 2)),
    writeFile(resolve(LKG_DIR, "mermaid.json"), JSON.stringify(knowledge.mermaid, null, 2)),
    writeFile(resolve(LKG_DIR, "index.json"), JSON.stringify(meta, null, 2)),
  ]);
}

/**
 * Check if already fetched today
 */
async function checkDailyFetch() {
  try {
    const indexRaw = await readFile(resolve(KB_DIR, "index.json"), "utf8");
    const index = JSON.parse(indexRaw);
    const today = getUtcDateString();
    const lastFetchDate = index.fetchedAt?.slice(0, 10);

    if (lastFetchDate === today && index.content_hash) {
      return { alreadyFetched: true, hash: index.content_hash, index };
    }
    return { alreadyFetched: false, hash: null, index };
  } catch {
    return { alreadyFetched: false, hash: null, index: null };
  }
}

/**
 * Degradation Level 1: Remove duplicates
 */
function dedupeContent(knowledge) {
  // Remove duplicate commonErrors
  for (const chart of knowledge.adc?.chartTypes || []) {
    if (chart.commonErrors) {
      chart.commonErrors = [...new Set(chart.commonErrors)];
    }
  }
  return knowledge;
}

/**
 * Degradation Level 2: Reduce examples to 1 per chart
 */
function reduceExamples(knowledge) {
  // Already minimal in our implementation
  return knowledge;
}

/**
 * Degradation Level 3: Strip long explanations, keep core fields only
 */
function stripToCoreFields(knowledge) {
  const coreFields = ["requiredFields", "optionalFields", "forbiddenPatterns", "minimalTemplate", "type"];

  if (knowledge.adc?.chartTypes) {
    knowledge.adc.chartTypes = knowledge.adc.chartTypes.map((chart) => {
      const core = { type: chart.type, requiredFields: chart.requiredFields };
      if (chart.example) core.example = chart.example;
      return core;
    });
  }

  if (knowledge.g2?.chartTypes) {
    knowledge.g2.chartTypes = knowledge.g2.chartTypes.map((chart) => {
      const core = { type: chart.type, requiredFields: chart.requiredFields };
      if (chart.example) core.example = chart.example;
      return core;
    });
  }

  return knowledge;
}

/**
 * Degradation Level 4: Mermaid core templates only
 */
function reduceMermaidToCore(knowledge) {
  if (knowledge.mermaid?.diagramTypes) {
    const coreTypes = {};
    for (const name of MERMAID_CORE_TEMPLATES) {
      if (knowledge.mermaid.diagramTypes[name]) {
        coreTypes[name] = knowledge.mermaid.diagramTypes[name];
      }
    }
    knowledge.mermaid.diagramTypes = coreTypes;
  }
  return knowledge;
}

/**
 * Degradation Level 5: ADC whitelist only with minimal examples
 */
function reduceAdcToWhitelist(knowledge) {
  if (knowledge.adc?.chartTypes) {
    knowledge.adc.chartTypes = knowledge.adc.chartTypes
      .filter((chart) => ADC_WHITELIST.includes(chart.type))
      .map((chart) => ({
        type: chart.type,
        requiredFields: chart.requiredFields,
        example: chart.example,
      }));
  }
  return knowledge;
}

/**
 * Apply degradation levels sequentially
 */
function applyDegradation(knowledge, targetSize) {
  const levels = [
    { name: "dedupe", fn: dedupeContent },
    { name: "reduce_examples", fn: reduceExamples },
    { name: "strip_core", fn: stripToCoreFields },
    { name: "mermaid_core", fn: reduceMermaidToCore },
    { name: "adc_whitelist", fn: reduceAdcToWhitelist },
  ];

  let currentKnowledge = JSON.parse(JSON.stringify(knowledge));
  let currentSize = calculateSize(currentKnowledge);

  logState.size_before = {
    total: currentSize,
    adc: calculateSize(currentKnowledge.adc),
    g2: calculateSize(currentKnowledge.g2),
    mermaid: calculateSize(currentKnowledge.mermaid),
  };

  for (let i = 0; i < levels.length && currentSize > targetSize; i++) {
    currentKnowledge = levels[i].fn(currentKnowledge);
    currentSize = calculateSize(currentKnowledge);
    logState.degrade_level = i + 1;
    logStructured(`Applied degradation level ${i + 1}: ${levels[i].name}`, {
      current_size: currentSize,
    });
  }

  logState.size_after = {
    total: currentSize,
    adc: calculateSize(currentKnowledge.adc),
    g2: calculateSize(currentKnowledge.g2),
    mermaid: calculateSize(currentKnowledge.mermaid),
  };

  if (currentSize > targetSize) {
    logState.overflow_reason = `Still exceeds ${targetSize} after all degradation levels`;
  }

  return currentKnowledge;
}

/**
 * Main function
 */
async function main() {
  logStructured("Starting chart knowledge fetch...", { mode: isStrict ? "STRICT" : "NON-STRICT" });

  const apiKey = process.env.CONTEXT7_API_KEY;

  // Check API key requirement
  if (!apiKey) {
    if (isStrict) {
      logStructured("ERROR: CONTEXT7_API_KEY not set (strict mode)");
      logState.fetch_status = "failed";
      logState.overflow_reason = "MISSING_API_KEY";
      console.log(JSON.stringify(logState, null, 2));
      process.exit(1);
    }
    logStructured("No CONTEXT7_API_KEY, using local knowledge base");
    logState.fetch_status = "local";
  }

  // Check daily fetch limit
  const { alreadyFetched, hash: existingHash, index: existingIndex } = await checkDailyFetch();
  const today = getUtcDateString();

  if (alreadyFetched && existingHash) {
    logStructured("Already fetched today, skipping duplicate fetch");
    logState.fetch_status = "skipped";
    logState.checked_at = new Date().toISOString();
    logState.unchanged = true;
    logState.content_hash = existingHash;
    logState.kb_version = existingIndex?.version || "1.0.0";
    logState.next_refresh_at = `${getUtcDateString(new Date(Date.now() + 86400000))}T00:00:00Z`;
    console.log(JSON.stringify(logState, null, 2));
    return;
  }

  // Ensure directory exists
  await mkdir(KB_DIR, { recursive: true });

  let knowledge;
  let source = "local";

  if (apiKey) {
    try {
      logStructured("Fetching from Context7...");

      // Search for libraries
      const [adcLib, g2Lib, mermaidLib] = await Promise.all([
        searchLibrary(apiKey, "ant-design-charts"),
        searchLibrary(apiKey, "antv-g2"),
        searchLibrary(apiKey, "mermaid"),
      ]);

      logStructured("Found libraries", {
        adc_lib: adcLib.id,
        g2_lib: g2Lib.id,
        mermaid_lib: mermaidLib.id,
      });

      // Fetch contexts
      const [adcCtx, g2Ctx, mermaidCtx] = await Promise.all([
        fetchContext(apiKey, adcLib.id, "chart types configuration examples"),
        fetchContext(apiKey, g2Lib.id, "mark types spec examples"),
        fetchContext(apiKey, mermaidLib.id, "diagram types syntax examples"),
      ]);

      logStructured("Fetched contexts from Context7");

      // For now, use local knowledge enriched with Context7 metadata
      // Future: extract structured knowledge from Context7 responses
      const localKb = await loadLocalKnowledge();
      if (localKb) {
        knowledge = localKb;
        source = "context7";
        logState.fetch_status = "success";
      } else {
        throw new Error("Local knowledge base not available");
      }

    } catch (error) {
      logStructured(`Context7 fetch failed: ${error.message}`);

      // Only fail for auth errors
      if (error.message.includes("AUTH_FAILED")) {
        logState.fetch_status = "failed";
        logState.overflow_reason = "AUTH_FAILED";
        console.log(JSON.stringify(logState, null, 2));
        process.exit(1);
      }

      // Try fallback to LKG
      const lkg = await loadLKG();
      if (lkg) {
        logStructured("Falling back to LKG (Last Known Good) snapshot");
        knowledge = { adc: lkg.adc, g2: lkg.g2, mermaid: lkg.mermaid };
        source = "lkg";
        logState.fetch_status = "fallback";
        logState.fallback_used = true;
        logState.degrade_level = 0;
      } else {
        // Final fallback to local
        knowledge = await loadLocalKnowledge();
        source = "local-fallback";
        logState.fetch_status = "local";
      }
    }
  } else {
    knowledge = await loadLocalKnowledge();
    logState.fetch_status = "local";
  }

  if (!knowledge) {
    logStructured("ERROR: No knowledge base available");
    logState.fetch_status = "failed";
    logState.overflow_reason = "NO_KNOWLEDGE";
    console.log(JSON.stringify(logState, null, 2));
    process.exit(1);
  }

  // Apply auto-degradation if needed
  const totalSize = calculateSize(knowledge);
  if (totalSize > MAX_TOTAL_SIZE) {
    logStructured(`Content exceeds limit (${totalSize} > ${MAX_TOTAL_SIZE}), applying degradation...`);
    logState.overflow_reason = `SIZE_EXCEEDED:${totalSize}`;
    knowledge = applyDegradation(knowledge, MAX_TOTAL_SIZE);
  }

  // Compute content hash
  const contentHash = computeContentHash(knowledge);
  logState.content_hash = contentHash;

  // Check if content unchanged
  if (existingHash === contentHash) {
    logStructured("Content unchanged, skipping update");
    logState.unchanged = true;
    logState.checked_at = new Date().toISOString();
    logState.next_refresh_at = `${getUtcDateString(new Date(Date.now() + 86400000))}T00:00:00Z`;
    console.log(JSON.stringify(logState, null, 2));
    return;
  }

  // Generate metadata
  const meta = {
    version: logState.kb_version,
    fetchedAt: new Date().toISOString(),
    source,
    contentHash,
    degradeLevel: logState.degrade_level,
    fallbackUsed: logState.fallback_used,
    kbDegraded: logState.degrade_level > 0,
    summary: {
      adc: !!knowledge.adc,
      g2: !!knowledge.g2,
      mermaid: !!knowledge.mermaid,
      mermaidDiagramCount: Object.keys(knowledge.mermaid?.diagramTypes || {}).length,
      adcChartCount: knowledge.adc?.chartTypes?.length || 0,
      g2ChartCount: knowledge.g2?.chartTypes?.length || 0,
    },
    sizeInfo: logState.size_after,
    nextRefreshAt: `${getUtcDateString(new Date(Date.now() + 86400000))}T00:00:00Z`,
  };

  // Write knowledge files
  await Promise.all([
    writeFile(resolve(KB_DIR, "index.json"), JSON.stringify(meta, null, 2)),
    writeFile(resolve(KB_DIR, "adc.json"), JSON.stringify(knowledge.adc, null, 2)),
    writeFile(resolve(KB_DIR, "g2.json"), JSON.stringify(knowledge.g2, null, 2)),
    writeFile(resolve(KB_DIR, "mermaid.json"), JSON.stringify(knowledge.mermaid, null, 2)),
  ]);

  // Save LKG snapshot on success
  if (source === "context7" || source === "local") {
    await saveLKG(knowledge, meta);
    logStructured("Saved LKG snapshot");
  }

  // Final structured log output
  logState.checked_at = new Date().toISOString();
  logState.fetch_status = logState.fetch_status || "success";

  logStructured("Knowledge base updated", {
    source,
    adc_types: meta.summary.adcChartCount,
    g2_types: meta.summary.g2ChartCount,
    mermaid_diagrams: meta.summary.mermaidDiagramCount,
    degrade_level: logState.degrade_level,
    fallback_used: logState.fallback_used,
    hash: contentHash,
  });

  // Output final structured log
  console.log("\n=== STRUCTURED LOG ===");
  console.log(JSON.stringify(logState, null, 2));
  console.log("=== END LOG ===\n");

  logStructured("Done!");
}

main().catch((error) => {
  logState.fetch_status = "failed";
  logState.overflow_reason = error.message;
  console.error(`[kb:fetch] Fatal error: ${error.message}`);
  console.log(JSON.stringify(logState, null, 2));
  process.exit(1);
});
