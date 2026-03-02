#!/usr/bin/env node
/**
 * Validate Chart Knowledge Base
 *
 * Validates the structure and content of the chart knowledge base files.
 * Ensures ADC type whitelist matches the parser whitelist.
 * Checks for degradation markers and fallback status.
 *
 * Usage:
 *   node scripts/validate-chart-knowledge.mjs
 */

import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const KB_DIR = resolve(ROOT_DIR, "knowledge-base/charts");

// ADC parser whitelist (must match src/utils/adcSpecParser.ts)
const ADC_PARSER_WHITELIST = [
  "line",
  "column",
  "bar",
  "area",
  "pie",
  "scatter",
  "radar",
  "gauge",
  "heatmap",
  "funnel",
  "histogram",
  "dualAxes",
];

// Core Mermaid templates (minimum required)
const MERMAID_CORE_TEMPLATES = [
  "flowchart",
  "sequenceDiagram",
  "pie",
];

// Size limits
const MAX_TOTAL_SIZE = 100 * 1024; // 100KB
const MAX_FILE_SIZE = 50 * 1024;   // 50KB

/**
 * Calculate object size in bytes
 */
function calculateSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}

/**
 * Validate ADC knowledge
 */
function validateAdcKnowledge(adc) {
  const errors = [];
  const warnings = [];

  if (!adc.outputContract || !Array.isArray(adc.outputContract)) {
    errors.push("ADC: missing or invalid outputContract array");
  }

  if (!adc.typeWhitelist || !Array.isArray(adc.typeWhitelist)) {
    errors.push("ADC: missing or invalid typeWhitelist array");
  } else {
    // Check whitelist matches parser
    const missing = ADC_PARSER_WHITELIST.filter((t) => !adc.typeWhitelist.includes(t));
    const extra = adc.typeWhitelist.filter((t) => !ADC_PARSER_WHITELIST.includes(t));

    if (missing.length > 0) {
      errors.push(`ADC: typeWhitelist missing types: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      warnings.push(`ADC: typeWhitelist has extra types: ${extra.join(", ")}`);
    }
  }

  if (!adc.chartTypes || !Array.isArray(adc.chartTypes)) {
    errors.push("ADC: missing or invalid chartTypes array");
  } else {
    const definedTypes = new Set();
    for (const rule of adc.chartTypes) {
      if (!rule.type) {
        errors.push("ADC: chartType missing type field");
        continue;
      }
      definedTypes.add(rule.type);

      if (!rule.requiredFields || !Array.isArray(rule.requiredFields)) {
        errors.push(`ADC: ${rule.type} missing requiredFields`);
      }
      if (!rule.example) {
        warnings.push(`ADC: ${rule.type} missing example`);
      }
    }

    // In degraded mode, not all types may have rules
    // Only warn for core types
    for (const type of ADC_PARSER_WHITELIST.slice(0, 6)) {
      if (!definedTypes.has(type)) {
        warnings.push(`ADC: no chartType rule for core type ${type}`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate G2 knowledge
 */
function validateG2Knowledge(g2) {
  const errors = [];
  const warnings = [];

  if (!g2.outputContract || !Array.isArray(g2.outputContract)) {
    errors.push("G2: missing or invalid outputContract array");
  }

  if (!g2.chartTypes || !Array.isArray(g2.chartTypes)) {
    errors.push("G2: missing or invalid chartTypes array");
  } else {
    for (const rule of g2.chartTypes) {
      if (!rule.type) {
        errors.push("G2: chartType missing type field");
        continue;
      }
      if (!rule.requiredFields || !Array.isArray(rule.requiredFields)) {
        errors.push(`G2: ${rule.type} missing requiredFields`);
      }
      if (!rule.example) {
        warnings.push(`G2: ${rule.type} missing example`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate Mermaid knowledge
 */
function validateMermaidKnowledge(mermaid) {
  const errors = [];
  const warnings = [];

  if (!mermaid.diagramTypes || typeof mermaid.diagramTypes !== "object") {
    errors.push("Mermaid: missing or invalid diagramTypes object");
  } else {
    const definedTypes = Object.keys(mermaid.diagramTypes);

    // Check core templates exist
    for (const name of MERMAID_CORE_TEMPLATES) {
      if (!mermaid.diagramTypes[name]) {
        errors.push(`Mermaid: missing core template ${name}`);
      }
    }

    for (const [name, template] of Object.entries(mermaid.diagramTypes)) {
      if (!template.whenToUse) {
        warnings.push(`Mermaid: ${name} missing whenToUse`);
      }
      if (!template.minimalTemplate) {
        warnings.push(`Mermaid: ${name} missing minimalTemplate`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate index.json
 */
function validateIndex(index) {
  const errors = [];
  const warnings = [];

  if (!index.version) {
    warnings.push("index: missing version");
  }
  if (!index.fetchedAt) {
    errors.push("index: missing fetchedAt");
  }
  if (!index.source) {
    warnings.push("index: missing source");
  }
  if (!index.contentHash) {
    warnings.push("index: missing contentHash");
  }
  if (!index.summary || typeof index.summary !== "object") {
    errors.push("index: missing or invalid summary");
  }

  // Check degradation markers
  if (index.kbDegraded === true) {
    warnings.push("index: kbDegraded=true - knowledge base was compressed");
  }
  if (index.fallbackUsed === true) {
    warnings.push("index: fallbackUsed=true - using LKG snapshot");
  }

  return { errors, warnings };
}

/**
 * Validate size limits
 */
function validateSizes(adc, g2, mermaid, index) {
  const errors = [];
  const warnings = [];

  const sizes = {
    adc: calculateSize(adc),
    g2: calculateSize(g2),
    mermaid: calculateSize(mermaid),
    index: calculateSize(index),
  };

  const total = sizes.adc + sizes.g2 + sizes.mermaid;

  if (total > MAX_TOTAL_SIZE) {
    errors.push(`Size: total size ${total} bytes exceeds limit ${MAX_TOTAL_SIZE}`);
  }

  for (const [name, size] of Object.entries(sizes)) {
    if (size > MAX_FILE_SIZE) {
      warnings.push(`Size: ${name}.json (${size} bytes) exceeds recommended ${MAX_FILE_SIZE}`);
    }
  }

  return { errors, warnings, sizes, total };
}

/**
 * Main function
 */
async function main() {
  console.log("[kb:validate] Validating chart knowledge base...");

  const allErrors = [];
  const allWarnings = [];

  let sizes = {};
  let totalSize = 0;

  try {
    console.log("[kb:validate] Loading knowledge base files...");

    const [indexRaw, adcRaw, g2Raw, mermaidRaw] = await Promise.all([
      readFile(resolve(KB_DIR, "index.json"), "utf8"),
      readFile(resolve(KB_DIR, "adc.json"), "utf8"),
      readFile(resolve(KB_DIR, "g2.json"), "utf8"),
      readFile(resolve(KB_DIR, "mermaid.json"), "utf8"),
    ]);

    const index = JSON.parse(indexRaw);
    const adc = JSON.parse(adcRaw);
    const g2 = JSON.parse(g2Raw);
    const mermaid = JSON.parse(mermaidRaw);

    // Validate sizes
    console.log("[kb:validate] Checking size limits...");
    const sizeResult = validateSizes(adc, g2, mermaid, index);
    allErrors.push(...sizeResult.errors.map((e) => `  [size] ${e}`));
    allWarnings.push(...sizeResult.warnings.map((w) => `  [size] ${w}`));
    sizes = sizeResult.sizes;
    totalSize = sizeResult.total;

    // Validate each section
    console.log("[kb:validate] Validating index.json...");
    const indexResult = validateIndex(index);
    allErrors.push(...indexResult.errors.map((e) => `  [index] ${e}`));
    allWarnings.push(...indexResult.warnings.map((w) => `  [index] ${w}`));

    console.log("[kb:validate] Validating adc.json...");
    const adcResult = validateAdcKnowledge(adc);
    allErrors.push(...adcResult.errors.map((e) => `  [adc] ${e}`));
    allWarnings.push(...adcResult.warnings.map((w) => `  [adc] ${w}`));

    console.log("[kb:validate] Validating g2.json...");
    const g2Result = validateG2Knowledge(g2);
    allErrors.push(...g2Result.errors.map((e) => `  [g2] ${e}`));
    allWarnings.push(...g2Result.warnings.map((w) => `  [g2] ${w}`));

    console.log("[kb:validate] Validating mermaid.json...");
    const mermaidResult = validateMermaidKnowledge(mermaid);
    allErrors.push(...mermaidResult.errors.map((e) => `  [mermaid] ${e}`));
    allWarnings.push(...mermaidResult.warnings.map((w) => `  [mermaid] ${w}`));

    // Validate JSON examples are parseable
    console.log("[kb:validate] Validating ADC example JSONs...");
    for (const rule of adc.chartTypes || []) {
      try {
        JSON.parse(rule.example);
      } catch {
        allErrors.push(`  [adc] ${rule.type}: example is not valid JSON`);
      }
    }

    console.log("[kb:validate] Validating G2 example JSONs...");
    for (const rule of g2.chartTypes || []) {
      try {
        JSON.parse(rule.example);
      } catch {
        allErrors.push(`  [g2] ${rule.type}: example is not valid JSON`);
      }
    }

  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`[kb:validate] ERROR: File not found: ${error.path}`);
      console.error("[kb:validate] Run 'npm run kb:refresh' to generate knowledge base");
    } else {
      console.error(`[kb:validate] ERROR: ${error.message}`);
    }
    process.exit(1);
  }

  // Report warnings
  if (allWarnings.length > 0) {
    console.log("\n[kb:validate] WARNINGS:");
    for (const warning of allWarnings) {
      console.log(`  \x1b[33m${warning}\x1b[0m`);
    }
  }

  // Report errors
  if (allErrors.length > 0) {
    console.error("\n[kb:validate] VALIDATION FAILED:");
    for (const error of allErrors) {
      console.error(error);
    }
    console.error(`\n[kb:validate] ${allErrors.length} error(s) found`);
    process.exit(1);
  }

  // Success
  console.log("\n[kb:validate] VALIDATION PASSED");
  console.log(`[kb:validate] ADC types: ${ADC_PARSER_WHITELIST.length}`);
  console.log(`[kb:validate] G2 types: 5`);
  console.log(`[kb:validate] Mermaid diagrams: ${Object.keys(JSON.parse(await readFile(resolve(KB_DIR, "mermaid.json"), "utf8")).diagramTypes || {}).length}`);
  console.log(`[kb:validate] Total size: ${totalSize} bytes`);

  // Output structured result
  console.log("\n=== VALIDATION RESULT ===");
  console.log(JSON.stringify({
    status: "passed",
    errors: allErrors.length,
    warnings: allWarnings.length,
    sizes,
    totalSize,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log("=== END RESULT ===\n");
}

main().catch((error) => {
  console.error(`[kb:validate] Fatal error: ${error.message}`);
  process.exit(1);
});
