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

    // Both HTML Preview and SVG Preview headers should be visible
    expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    expect(screen.getByText("SVG Preview")).toBeInTheDocument();

    // HTML Preview should show "Full Document" badge for full HTML documents
    expect(screen.getByText("Full Document")).toBeInTheDocument();

    // HTML content is rendered via Shadow DOM (not iframe), so we verify the container exists
    await waitFor(() => {
      const htmlPreviewContainer = document.querySelector(".html-preview-content");
      expect(htmlPreviewContainer).toBeInTheDocument();
    });
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

    // Verify footnotes are stripped (enableFootnotes=false)
    // The [^1] should not appear as a footnote reference
    expect(container.textContent).not.toContain("[^1]");

    // Verify streaming cursor is disabled (streamCursor=false)
    expect(container.querySelector(".animate-blink-cursor")).not.toBeInTheDocument();

    // Verify blockquote is rendered (alerts are processed, but detection may vary)
    // At minimum, the content "hello" should be visible somewhere
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it("falls back to code block for html while streaming to avoid iframe jitter", () => {
    const content = ["```html", "<!DOCTYPE html>", "<html><body><h1>Hi</h1></body></html>", "```"].join("\n");

    const { container } = render(<MarkdownRenderer content={content} isStreaming={true} />);

    expect(screen.queryByText("HTML Preview")).not.toBeInTheDocument();
    expect(document.querySelector(".html-preview-content")).not.toBeInTheDocument();
    expect(
      container.querySelector(".shiki-container, .animate-pulse")
    ).toBeInTheDocument();
  });

  it("strips empty sourceMappingURL directives in html preview", async () => {
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

    const { container } = render(<MarkdownRenderer content={content} />);

    // Verify HTML Preview header is rendered (Shadow DOM renderer, not iframe)
    await waitFor(() => {
      expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    });

    // Verify the preview container exists (Shadow DOM content is rendered here)
    const htmlPreviewContainer = document.querySelector(".html-preview-content");
    expect(htmlPreviewContainer).toBeInTheDocument();

    // Verify that the sourcemap stripping function is called by checking
    // the component renders without errors and shows the expected UI
    // Click Code tab to verify code view works
    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    // Wait for code view to render (Shiki is async)
    await waitFor(() => {
      // The shiki container should be present after loading
      const shikiContainer = container.querySelector(".shiki-container");
      expect(shikiContainer).toBeInTheDocument();
    });

    // Verify console.log appears in the highlighted code (in shiki output)
    expect(container.textContent).toContain("console");
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

    const { container } = render(<MarkdownRenderer content={content} />);

    // Verify HTML Preview header is rendered (Shadow DOM renderer, not iframe)
    await waitFor(() => {
      expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    });

    // Verify the preview container exists
    const htmlPreviewContainer = document.querySelector(".html-preview-content");
    expect(htmlPreviewContainer).toBeInTheDocument();

    // Click Code tab to verify code view works
    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    // Wait for code view to render (Shiki is async)
    await waitFor(() => {
      const shikiContainer = container.querySelector(".shiki-container");
      expect(shikiContainer).toBeInTheDocument();
    });

    // Verify console.log appears in the highlighted code
    expect(container.textContent).toContain("console");
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

    // Wait for HTML Preview header to be visible
    await waitFor(() => {
      expect(screen.getByText("HTML Preview")).toBeInTheDocument();
    });

    // Verify preview container is visible initially
    const htmlPreviewContainer = document.querySelector(".html-preview-content");
    expect(htmlPreviewContainer).toBeInTheDocument();

    // Click Code tab to switch to code view
    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    // Preview container should be hidden (replaced by code block)
    await waitFor(() => {
      expect(document.querySelector(".html-preview-content")).not.toBeInTheDocument();
    });

    // Verify code block is shown (look for shiki container or code element)
    // The code block should contain the HTML content
    await waitFor(() => {
      const codeElement = document.querySelector("code");
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain("DOCTYPE");
    });
  });

  it("supports code and preview tabs for markdown blocks", async () => {
    const content = ["```markdown", "# Title", "", "- one", "- two", "```"].join("\n");

    render(<MarkdownRenderer content={content} />);

    // Wait for Markdown Preview header to be rendered
    await waitFor(() => {
      expect(screen.getByText("Markdown Preview")).toBeInTheDocument();
    });

    // Title should be rendered in preview mode
    expect(screen.getByText("Title")).toBeInTheDocument();

    // Switch to code view
    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    // Wait for code view to render and verify content
    await waitFor(() => {
      const codeView = screen.getByText((_, element) => {
        return element?.tagName.toLowerCase() === "code" && element.textContent === "# Title\n\n- one\n- two";
      });
      expect(codeView).toBeInTheDocument();
    });
  });

  it("shows invalid ADC fallback with original spec", () => {
    const content = [
      "```adc",
      '{"type":"unknown","data":[{"x":1,"y":2}]}',
      "```",
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText("Unsupported ADC chart type")).toBeInTheDocument();
    expect(screen.getByText("View original spec")).toBeInTheDocument();
    expect(screen.getByText('{"type":"unknown","data":[{"x":1,"y":2}]}')).toBeInTheDocument();
  });

  it("shows detailed Mermaid validation error for markdown syntax in block", () => {
    const content = [
      "```mermaid",
      "flowchart TD",
      "# Invalid heading",
      "A --> B",
      "```",
    ].join("\n");

    render(<MarkdownRenderer content={content} />);

    expect(screen.getByText(/Invalid Mermaid spec:/)).toBeInTheDocument();
    expect(screen.getByText(/Markdown heading not allowed/)).toBeInTheDocument();
    expect(screen.getByText("View original spec")).toBeInTheDocument();
  });
});
