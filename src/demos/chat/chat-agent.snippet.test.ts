import { describe, expect, it } from "vitest";
import { extractSnippet } from "./snippet-utils";

describe("extractSnippet", () => {
  it("returns empty string for empty input", () => {
    expect(extractSnippet("")).toBe("");
    expect(extractSnippet("   ")).toBe("");
    expect(extractSnippet("\n\t")).toBe("");
  });

  it("removes fenced code blocks", () => {
    const input = "Here is some code:\n```typescript\nconst x = 1;\n```\nAnd more text.";
    expect(extractSnippet(input)).toBe("Here is some code: And more text.");
  });

  it("removes inline code", () => {
    const input = "Use the `extractSnippet` function to process text.";
    // Inline code content is removed entirely
    expect(extractSnippet(input)).toBe("Use the function to process text.");
  });

  it("preserves link text while removing URL syntax", () => {
    const input = "Check out [Claude Code](https://claude.ai) for more info.";
    expect(extractSnippet(input)).toBe("Check out Claude Code for more info.");
  });

  it("handles multiple markdown elements together", () => {
    const input =
      "Install with `npm i` then see [docs](https://example.com):\n```js\nconsole.log('hi');\n```\nDone!";
    // Inline code is removed, so "npm i" is stripped
    expect(extractSnippet(input)).toBe("Install with then see docs: Done!");
  });

  it("truncates long text with ellipsis", () => {
    const longText = "A".repeat(100);
    const result = extractSnippet(longText, 72);
    expect(result.length).toBe(72);
    expect(result).toBe("A".repeat(69) + "...");
  });

  it("does not truncate short text", () => {
    const shortText = "Hello world";
    expect(extractSnippet(shortText)).toBe("Hello world");
  });

  it("compresses multiple whitespace to single space", () => {
    const input = "Hello   \n\n  \t  world";
    expect(extractSnippet(input)).toBe("Hello world");
  });

  it("handles Chinese text correctly", () => {
    const input = "这是一段中文文本，用于测试截断功能是否正常工作。";
    const result = extractSnippet(input, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles mixed Chinese and English", () => {
    const input = "Hello 世界! This is a `test` with [link](https://example.com).";
    // Inline code is removed, so "test" is stripped
    expect(extractSnippet(input)).toBe("Hello 世界! This is a with link.");
  });

  it("respects custom max length", () => {
    const input = "This is a long sentence that should be truncated.";
    const result = extractSnippet(input, 20);
    expect(result.length).toBe(20);
    // 17 chars + "..." = 20
    expect(result).toBe("This is a long se...");
  });

  it("handles code block with language specifier", () => {
    const input = "Code:\n```typescript\nconst x: number = 1;\n```\nEnd.";
    expect(extractSnippet(input)).toBe("Code: End.");
  });

  it("handles unclosed code blocks gracefully", () => {
    const input = "Start ```code block never closed";
    // Unclosed code block - regex won't match, so it stays
    expect(extractSnippet(input)).toContain("Start");
  });
});
