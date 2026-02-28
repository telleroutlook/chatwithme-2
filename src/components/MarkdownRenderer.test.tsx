import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders svg preview for xml code blocks containing svg markup", () => {
    const content = [
      "```xml",
      '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">',
      '  <circle cx="50" cy="50" r="40" fill="#4facfe" />',
      "</svg>",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
  });

  it("renders svg preview from a realistic assistant reply block", () => {
    const content = `【当然可以！为了给您展示 SVG 代码，我为您绘制了一个简洁现代的**科技风格示意图**（包含背景、几何图形、渐变效果和文字）。

您可以直接复制下面的代码，保存为 \`.svg\` 文件，或者嵌入到 HTML 中使用。

\`\`\`xml
<svg width="600" height="400" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="600" height="400" rx="20" ry="20" fill="#f9fafb" />
</svg>
\`\`\`

### 代码说明：
1. 示例。】`;

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
  });

  it("renders svg preview when svg tags are html-escaped in xml block", () => {
    const content = [
      "```xml",
      "&lt;svg width=&quot;80&quot; height=&quot;80&quot; xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;",
      "  &lt;circle cx=&quot;40&quot; cy=&quot;40&quot; r=&quot;30&quot; fill=&quot;#00f2fe&quot; /&gt;",
      "&lt;/svg&gt;",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
  });
});
