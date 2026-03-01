import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByText("SVG Preview")).toBeInTheDocument();
    expect(screen.getByAltText("SVG Preview")).toBeInTheDocument();
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

    expect(screen.getByText("SVG Preview")).toBeInTheDocument();
    expect(screen.getByAltText("SVG Preview")).toBeInTheDocument();
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

    expect(screen.getByText("SVG Preview")).toBeInTheDocument();
    expect(screen.getByAltText("SVG Preview")).toBeInTheDocument();
  });

  it("renders html preview and svg preview for full html documents containing svg", async () => {
    const content = [
      "```html",
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      '<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="red" /></svg>',
      "</body>",
      "</html>",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    expect(screen.getByText("SVG Preview")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
    });
    const frame = screen.getByTitle("HTML Preview");
    const srcDoc = frame.getAttribute("srcdoc") || "";
    expect(srcDoc).toContain("<!DOCTYPE html>");
    expect(srcDoc).not.toContain("font-family:ui-sans-serif");
    expect(frame.className).not.toContain("pointer-events-none");
    expect(frame.getAttribute("scrolling")).toBe("auto");
    expect((frame as HTMLIFrameElement).style.height).toBe("560px");
  });

  it("supports markdown feature toggles", () => {
    const content = "> [!NOTE]\n> hello[^1]\n\n[^1]: test";

    const { container } = render(
      <MarkdownRenderer
        content={content}
        isStreaming={true}
        enableAlerts={true}
        enableFootnotes={false}
        streamCursor={false}
      />
    );

    expect(screen.getByText("NOTE")).toBeInTheDocument();
    expect(container.textContent).not.toContain("^1");
    expect(container.querySelector(".animate-blink-cursor")).not.toBeInTheDocument();
  });

  it("falls back to code block for html while streaming to avoid iframe jitter", () => {
    const content = ["```html", "<!DOCTYPE html>", "<html><body><h1>Hi</h1></body></html>", "```"].join("\n");

    render(<MarkdownRenderer content={content} isStreaming={true} />);

    expect(screen.queryByText("HTML Preview")).not.toBeInTheDocument();
    expect(screen.getByText("html")).toBeInTheDocument();
  });

  it("strips empty sourceMappingURL directives in html preview srcdoc", async () => {
    const content = [
      "```html",
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      "<script>",
      "//# sourceMappingURL=",
      "console.log('ok')",
      "</script>",
      "</body>",
      "</html>",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    await waitFor(() => {
      expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
    });
    const frame = screen.getByTitle("HTML Preview");
    const srcDoc = frame.getAttribute("srcdoc") || "";
    expect(srcDoc).not.toContain("sourceMappingURL=");
    expect(srcDoc).toContain("console.log('ok')");
  });

  it("strips null and undefined sourceMappingURL directives", async () => {
    const content = [
      "```html",
      "<script>",
      "//# sourceMappingURL=null",
      "/*# sourceMappingURL=undefined */",
      "console.log('ok')",
      "</script>",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    await waitFor(() => {
      expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
    });
    const frame = screen.getByTitle("HTML Preview");
    const srcDoc = frame.getAttribute("srcdoc") || "";
    expect(srcDoc).not.toContain("sourceMappingURL=");
    expect(srcDoc).toContain("console.log('ok')");
  });

  it("sanitizes invalid svg stroke-width and height declarations", () => {
    const content = [
      "```xml",
      '<svg width="80" height="" xmlns="http://www.w3.org/2000/svg">',
      '  <path d="M0 0L10 10" stroke="#000" stroke-width="" style="stroke-width: ; height: undefined;" />',
      "</svg>",
      "```"
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    const preview = screen.getByAltText("SVG Preview") as HTMLImageElement;
    const decoded = decodeURIComponent(preview.src);
    expect(decoded).not.toContain('stroke-width=""');
    expect(decoded).not.toContain("stroke-width: ;");
    expect(decoded).not.toContain('height=""');
    expect(decoded).not.toContain("height: undefined");
  });

  it("can hide html preview by toggle", async () => {
    const content = ["```html", "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>", "```"].join("\n");

    render(<MarkdownRenderer content={content} />);

    await waitFor(() => {
      expect(screen.getByTitle("HTML Preview")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    expect(screen.queryByTitle("HTML Preview")).not.toBeInTheDocument();
    expect(screen.getByText("<!DOCTYPE html><html><body><h1>Hi</h1></body></html>")).toBeInTheDocument();
  });

  it("supports code and preview tabs for markdown blocks", () => {
    const content = ["```markdown", "# Title", "", "- one", "- two", "```"].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("Markdown Preview")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    const codeView = screen.getByText((_, element) => {
      return element?.tagName.toLowerCase() === "code" && element.textContent === "# Title\n\n- one\n- two";
    });
    expect(codeView).toBeInTheDocument();
  });
});
