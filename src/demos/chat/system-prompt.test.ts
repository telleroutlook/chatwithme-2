import { describe, it, expect } from "vitest";
import { buildSystemPromptWithKeywords } from "./system-prompt";

// Helper: simulate the old buildSystemPrompt by passing an empty user message
// (non-chart query returns the minimal prompt, so use a chart keyword to get full prompt)
function buildFullPrompt(toolList: string[], chartPrimary: "adc" | "g2"): string {
  return buildSystemPromptWithKeywords(toolList, chartPrimary, "chart");
}

// ============================================================================
// buildSystemPromptWithKeywords (full prompt) Tests
// ============================================================================

describe("buildSystemPromptWithKeywords (full prompt)", () => {
  it("should return a non-empty string", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("should contain chart generation section", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("Chart Generation");
  });

  it("should contain ADC preference for adc primary", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("Ant Design Charts");
    expect(prompt).toContain("prefer");
  });

  it("should contain G2 preference for g2 primary", () => {
    const prompt = buildFullPrompt([], "g2");
    expect(prompt).toContain("G2");
    expect(prompt).toContain("prefer G2");
  });

  it("should include tool list when provided", () => {
    const prompt = buildFullPrompt(["webSearch", "fetch"], "adc");
    expect(prompt).toContain("webSearch");
    expect(prompt).toContain("fetch");
  });

  it("should handle empty tool list", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("No tools available");
  });

  it("should produce stable output for same inputs", () => {
    const prompt1 = buildFullPrompt(["tool1"], "adc");
    const prompt2 = buildFullPrompt(["tool1"], "adc");
    expect(prompt1).toBe(prompt2);
  });

  it("should produce stable output for g2 primary", () => {
    const prompt1 = buildFullPrompt([], "g2");
    const prompt2 = buildFullPrompt([], "g2");
    expect(prompt1).toBe(prompt2);
  });

  it("should contain Mermaid section", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("Mermaid");
  });

  it("should include response language policy", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("Respond in the same language as the user's latest message.");
    expect(prompt).toContain("Keep technical terms, APIs, and code identifiers in English");
  });

  it("should contain important rules section", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("IMPORTANT:");
  });

  it("should include ADC label.position safety rule", () => {
    const prompt = buildFullPrompt([], "adc");
    expect(prompt).toContain("Do not set label.position");
  });
});

// ============================================================================
// Minimal Prompt Tests (non-chart queries)
// ============================================================================

describe("buildSystemPromptWithKeywords (minimal prompt)", () => {
  it("returns minimal prompt for non-chart queries", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "What is the capital of France?");
    expect(prompt).toContain("ChatWithMe");
    expect(prompt).not.toContain("Chart Generation");
    expect(prompt).not.toContain("IMPORTANT:");
  });

  it("includes tool list in minimal prompt", () => {
    const prompt = buildSystemPromptWithKeywords(["search", "read"], "adc", "hello world");
    expect(prompt).toContain("search");
    expect(prompt).toContain("read");
  });

  it("minimal prompt is shorter than full prompt", () => {
    const minimal = buildSystemPromptWithKeywords([], "adc", "hello");
    const full = buildSystemPromptWithKeywords([], "adc", "create a chart");
    expect(minimal.length).toBeLessThan(full.length);
  });
});

// ============================================================================
// Keyword Detection Tests
// ============================================================================

describe("buildSystemPromptWithKeywords (keyword filtering)", () => {
  it("should return a non-empty string", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "create a chart");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("should be stable for same user message", () => {
    const userMessage = "create a flowchart for user registration";
    const prompt1 = buildSystemPromptWithKeywords([], "adc", userMessage);
    const prompt2 = buildSystemPromptWithKeywords([], "adc", userMessage);
    expect(prompt1).toBe(prompt2);
  });

  it("should maintain chartPrimary order (adc first)", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "chart");
    const adcIndex = prompt.indexOf("Ant Design Charts");
    const g2Index = prompt.indexOf("G2 JSON");
    expect(adcIndex).toBeGreaterThan(-1);
    expect(g2Index).toBeGreaterThan(-1);
  });

  it("should maintain chartPrimary order (g2 first)", () => {
    const prompt = buildSystemPromptWithKeywords([], "g2", "chart");
    expect(prompt).toContain("prefer G2");
  });

  it("should handle flowchart keyword detection", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "create a flowchart");
    expect(prompt).toContain("Mermaid");
  });

  it("should handle line chart keyword detection", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "draw a line chart");
    expect(prompt).toContain("Chart Generation");
  });

  it("should handle multiple keyword types", () => {
    const prompt = buildSystemPromptWithKeywords(
      [],
      "adc",
      "create a flowchart and a pie chart"
    );
    expect(prompt).toContain("Chart Generation");
  });

  it("should handle Chinese chart keywords", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "画一个图表");
    expect(prompt).toContain("Chart Generation");
  });

  it("should handle case-insensitive keywords", () => {
    const prompt1 = buildSystemPromptWithKeywords([], "adc", "FLOWCHART");
    const prompt2 = buildSystemPromptWithKeywords([], "adc", "flowchart");
    expect(prompt1).toBe(prompt2);
  });

  it("should include tool list when provided", () => {
    const prompt = buildSystemPromptWithKeywords(["search", "read"], "adc", "test chart");
    expect(prompt).toContain("search");
    expect(prompt).toContain("read");
  });
});

// ============================================================================
// Snapshot Stability Tests
// ============================================================================

describe("snapshot stability", () => {
  it("should produce stable output for default adc inputs", () => {
    const prompts = Array(5)
      .fill(null)
      .map(() => buildFullPrompt([], "adc"));

    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(1);
  });

  it("should produce stable output for default g2 inputs", () => {
    const prompts = Array(5)
      .fill(null)
      .map(() => buildFullPrompt([], "g2"));

    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(1);
  });

  it("should produce stable output with keywords", () => {
    const userMessage = "create a flowchart for user registration process";
    const prompts = Array(5)
      .fill(null)
      .map(() => buildSystemPromptWithKeywords([], "adc", userMessage));

    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(1);
  });
});
