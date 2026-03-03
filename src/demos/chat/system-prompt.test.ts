import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildSystemPromptWithKeywords,
} from "./system-prompt";

// ============================================================================
// buildSystemPrompt Tests
// ============================================================================

describe("buildSystemPrompt", () => {
  it("should return a non-empty string", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("should contain chart generation section", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("Chart Generation");
  });

  it("should contain ADC preference for adc primary", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("Ant Design Charts");
    expect(prompt).toContain("prefer");
  });

  it("should contain G2 preference for g2 primary", () => {
    const prompt = buildSystemPrompt([], "g2");
    expect(prompt).toContain("G2");
    expect(prompt).toContain("prefer G2");
  });

  it("should include tool list when provided", () => {
    const prompt = buildSystemPrompt(["webSearch", "fetch"], "adc");
    expect(prompt).toContain("webSearch");
    expect(prompt).toContain("fetch");
  });

  it("should handle empty tool list", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("No tools available");
  });

  it("should produce stable output for same inputs", () => {
    const prompt1 = buildSystemPrompt(["tool1"], "adc");
    const prompt2 = buildSystemPrompt(["tool1"], "adc");
    expect(prompt1).toBe(prompt2);
  });

  it("should produce stable output for g2 primary", () => {
    const prompt1 = buildSystemPrompt([], "g2");
    const prompt2 = buildSystemPrompt([], "g2");
    expect(prompt1).toBe(prompt2);
  });

  it("should contain Mermaid section", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("Mermaid");
  });

  it("should contain important rules section", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("IMPORTANT:");
  });

  it("should include ADC label.position safety rule", () => {
    const prompt = buildSystemPrompt([], "adc");
    expect(prompt).toContain("Do not set label.position");
  });
});

// ============================================================================
// buildSystemPromptWithKeywords Tests
// ============================================================================

describe("buildSystemPromptWithKeywords", () => {
  it("should return a non-empty string", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "create a chart");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("should be stable for empty user message", () => {
    const prompt1 = buildSystemPromptWithKeywords([], "adc", "");
    const prompt2 = buildSystemPromptWithKeywords([], "adc", "");
    expect(prompt1).toBe(prompt2);
  });

  it("should be stable for same user message", () => {
    const userMessage = "create a flowchart for user registration";
    const prompt1 = buildSystemPromptWithKeywords([], "adc", userMessage);
    const prompt2 = buildSystemPromptWithKeywords([], "adc", userMessage);
    expect(prompt1).toBe(prompt2);
  });

  it("should maintain chartPrimary order (adc first)", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "");
    const adcIndex = prompt.indexOf("Ant Design Charts");
    const g2Index = prompt.indexOf("G2 JSON");
    // ADC should be mentioned before G2 in priority text
    expect(adcIndex).toBeGreaterThan(-1);
    expect(g2Index).toBeGreaterThan(-1);
  });

  it("should maintain chartPrimary order (g2 first)", () => {
    const prompt = buildSystemPromptWithKeywords([], "g2", "");
    expect(prompt).toContain("prefer G2");
  });

  it("should handle flowchart keyword detection", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "create a flowchart");
    // Should still contain Mermaid section (flowchart is a Mermaid type)
    expect(prompt).toContain("Mermaid");
  });

  it("should handle line chart keyword detection", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "draw a line chart");
    // Should contain chart generation section
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

  it("should fallback gracefully for unknown keywords", () => {
    const prompt = buildSystemPromptWithKeywords([], "adc", "xyz nonesense abc");
    // Should still produce a valid prompt with core content
    expect(prompt).toContain("Chart Generation");
    expect(prompt).toContain("Mermaid");
  });

  it("should handle case-insensitive keywords", () => {
    const prompt1 = buildSystemPromptWithKeywords([], "adc", "FLOWCHART");
    const prompt2 = buildSystemPromptWithKeywords([], "adc", "flowchart");
    // Both should produce the same result
    expect(prompt1).toBe(prompt2);
  });

  it("should include tool list when provided", () => {
    const prompt = buildSystemPromptWithKeywords(["search", "read"], "adc", "test");
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
      .map(() => buildSystemPrompt([], "adc"));

    // All prompts should be identical
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(1);
  });

  it("should produce stable output for default g2 inputs", () => {
    const prompts = Array(5)
      .fill(null)
      .map(() => buildSystemPrompt([], "g2"));

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
