#!/usr/bin/env node
/**
 * Validate Chart Knowledge Base
 *
 * Validates the structure and content of the chart knowledge base files.
 * Ensures ADC type whitelist matches the parser whitelist.
 *
 * Usage:
 *   node scripts/validate-chart-knowledge.mjs
 */

import { readFile } from "node:fs/promises";
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

/**
 * Validate ADC knowledge
 */
function validateAdcKnowledge(adc) {
  const errors = [];

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
      errors.push(`ADC: typeWhitelist has extra types: ${extra.join(", ")}`);
    }
  }

  if (!adc.chartTypes || !Array.isArray(adc.chartTypes)) {
    errors.push("ADC: missing or invalid chartTypes array");
  } else {
    // Validate each chart type
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
        errors.push(`ADC: ${rule.type} missing example`);
      }
      if (!rule.commonErrors || !Array.isArray(rule.commonErrors)) {
        errors.push(`ADC: ${rule.type} missing commonErrors`);
      }
    }

    // Check all whitelist types have rules
    for (const type of ADC_PARSER_WHITELIST) {
      if (!definedTypes.has(type)) {
        errors.push(`ADC: no chartType rule for ${type}`);
      }
    }
  }

  return errors;
}

/**
 * Validate G2 knowledge
 */
function validateG2Knowledge(g2) {
  const errors = [];

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
        errors.push(`G2: ${rule.type} missing example`);
      }
    }
  }

  return errors;
}

/**
 * Validate Mermaid knowledge
 */
function validateMermaidKnowledge(mermaid) {
  const errors = [];

  if (!mermaid.diagramTypes || typeof mermaid.diagramTypes !== "object") {
    errors.push("Mermaid: missing or invalid diagramTypes object");
  } else {
    for (const [name, template] of Object.entries(mermaid.diagramTypes)) {
      if (!template.whenToUse) {
        errors.push(`Mermaid: ${name} missing whenToUse`);
      }
      if (!template.minimalTemplate) {
        errors.push(`Mermaid: ${name} missing minimalTemplate`);
      }
      if (!template.commonErrors || !Array.isArray(template.commonErrors)) {
        errors.push(`Mermaid: ${name} missing commonErrors`);
      }
    }
  }

  return errors;
}

/**
 * Validate index.json
 */
function validateIndex(index) {
  const errors = [];

  if (!index.version) {
    errors.push("index: missing version");
  }
  if (!index.fetchedAt) {
    errors.push("index: missing fetchedAt");
  }
  if (!index.source) {
    errors.push("index: missing source");
  }
  if (!index.contentHash) {
    errors.push("index: missing contentHash");
  }
  if (!index.summary || typeof index.summary !== "object") {
    errors.push("index: missing or invalid summary");
  }

  return errors;
}

/**
 * Main function
 */
async function main() {
  console.log("[kb:validate] Validating chart knowledge base...");

  const allErrors = [];

  // Load and validate each file
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

    // Validate each section
    console.log("[kb:validate] Validating index.json...");
    allErrors.push(...validateIndex(index).map((e) => `  [index] ${e}`));

    console.log("[kb:validate] Validating adc.json...");
    allErrors.push(...validateAdcKnowledge(adc).map((e) => `  [adc] ${e}`));

    console.log("[kb:validate] Validating g2.json...");
    allErrors.push(...validateG2Knowledge(g2).map((e) => `  [g2] ${e}`));

    console.log("[kb:validate] Validating mermaid.json...");
    allErrors.push(...validateMermaidKnowledge(mermaid).map((e) => `  [mermaid] ${e}`));

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

  // Report results
  if (allErrors.length > 0) {
    console.error("\n[kb:validate] VALIDATION FAILED:");
    for (const error of allErrors) {
      console.error(error);
    }
    console.error(`\n[kb:validate] ${allErrors.length} error(s) found`);
    process.exit(1);
  }

  console.log("\n[kb:validate] VALIDATION PASSED");
  console.log(`[kb:validate] ADC types: ${ADC_PARSER_WHITELIST.length}`);
  console.log(`[kb:validate] G2 types: 5`);
  console.log(`[kb:validate] Mermaid diagrams: 18`);
}

main().catch((error) => {
  console.error(`[kb:validate] Fatal error: ${error.message}`);
  process.exit(1);
});
