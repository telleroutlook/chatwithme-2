/**
 * Rendered Chat PDF Export
 *
 * Renders all chat messages to a hidden off-screen container using React,
 * then captures them with html2canvas and writes paginated pages to jsPDF.
 *
 * Theme: colours are overridden inside the hidden container via injected CSS
 * variables — we never touch <html data-mode>, so the user sees no flicker.
 *
 * Chart handling: ECharts uses SVG renderer, so html2canvas captures charts
 * directly with no special handling needed.
 * The onclone callback injects LIGHT_OVERRIDE_CSS to ensure Tailwind's
 * color-mix() values don't cause issues in html2canvas's clone document.
 */

import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { UIMessage } from "ai";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import { formatMessageWithRolePrefix } from "../message-text";
import { disableOklabStylesheets } from "./image";

// ---------------------------------------------------------------------------
// CSS injected into the hidden container to force light-mode hex colours
// without touching <html data-mode> (avoids user-visible flicker).
// ---------------------------------------------------------------------------
const LIGHT_OVERRIDE_CSS = `
  * {
    --color-background: #f7f7f8;
    --color-surface: #ffffff;
    --color-surface-elevated: #ffffff;
    --color-surface-secondary: #f0f0f0;
    --color-surface-chat: #f7f7f8;
    --color-foreground: #0d0d0d;
    --color-foreground-muted: #6b6b6b;
    --color-foreground-subtle: #999999;
    --color-border: #e5e5e5;
    --color-border-strong: #cdcdcd;
    --color-accent: #0d0d0d;
    --color-accent-foreground: #ffffff;
    --color-muted: #f0f0f0;
    --color-success: #16a34a;
    --color-warning: #d97706;
    --color-danger: #dc2626;
    --color-info: #2563eb;
    --color-user-bubble: #0d0d0d;
    --color-user-bubble-text: #ffffff;
    --color-ring: #0d0d0d;
    --app-overlay: rgba(0,0,0,0.5);
    --app-surface-primary: #ffffff;
    --app-surface-secondary: #f0f0f0;
    --app-border-default: #e5e5e5;
    --app-border-strong: #cdcdcd;
    --app-text-primary: #0d0d0d;
    --app-text-muted: #6b6b6b;
    --app-accent: #0d0d0d;
    --app-color-success: #16a34a;
    --app-color-warning: #d97706;
    --app-color-danger: #dc2626;
    --app-color-info: #2563eb;
  }
  *, *::before, *::after {
    background-image: none !important;
    text-shadow: none !important;
    box-shadow: none !important;
    filter: none !important;
    backdrop-filter: none !important;
  }
  /* Override soft-colour classes that use color-mix(in oklab) */
  .app-bg-success-soft { background: #dcfce7 !important; }
  .app-bg-warning-soft { background: #fef9c3 !important; }
  .app-bg-danger-soft  { background: #fee2e2 !important; }
  .app-border-success-soft { border-color: #86efac !important; }
  .app-border-warning-soft { border-color: #fde047 !important; }
  .app-border-danger-soft  { border-color: #fca5a5 !important; }
`;

// ---------------------------------------------------------------------------
// Strip residual oklab/oklch/color-mix from inline styles in the clone.
// (Covers any dynamically injected styles that escaped our CSS override.)
// ---------------------------------------------------------------------------
const UNSAFE_COLOR_RE = /\b(oklab|oklch|color-mix|lch|lab)\s*\(/i;

function sanitizeInlineColors(doc: Document): void {
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const style = el.style;
    if (!style || style.length === 0) return;
    const props = Array.from({ length: style.length }, (_, i) => style.item(i));
    for (const prop of props) {
      const val = style.getPropertyValue(prop);
      if (!UNSAFE_COLOR_RE.test(val)) continue;
      const lp = prop.toLowerCase();
      if (lp.includes("background") || lp.includes("fill")) {
        style.setProperty(prop, "transparent", "important");
      } else if (lp.includes("border") || lp.includes("outline") || lp.includes("stroke")) {
        style.setProperty(prop, "#e2e8f0", "important");
      } else {
        style.setProperty(prop, "inherit", "important");
      }
    }
    const attr = el.getAttribute("style") ?? "";
    if (UNSAFE_COLOR_RE.test(attr)) {
      el.setAttribute(
        "style",
        attr.replace(/:\s*(?:oklab|oklch|color-mix|lch|lab)\s*\([^;)]*\)/gi, ": transparent")
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Strip oklab/oklch/color-mix declarations from all <style> sheets in a
// cloned document so html2canvas never tries to parse them.
// Also disables <link> stylesheets that contain unsafe color functions
// (html2canvas re-fetches linked sheets in the clone, so we must disable them).
// ---------------------------------------------------------------------------
function sanitizeStylesheets(doc: Document): void {
  // Patch inline <style> tags
  doc.querySelectorAll<HTMLStyleElement>("style").forEach((styleEl) => {
    if (!UNSAFE_COLOR_RE.test(styleEl.textContent ?? "")) return;
    styleEl.textContent = (styleEl.textContent ?? "").replace(
      /:\s*(?:oklab|oklch|color-mix|lch|lab)\s*\([^;{}]*\)/gi,
      ": transparent"
    );
  });

  // Disable <link rel="stylesheet"> sheets that carry unsafe color functions.
  // We can't read cross-origin sheets, so also disable by href heuristic.
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []);
      if (rules.some((r) => UNSAFE_COLOR_RE.test(r.cssText))) {
        (sheet as CSSStyleSheet).disabled = true;
      }
    } catch {
      // Cross-origin stylesheet — skip (can't read cssRules)
    }
  }
}

// ---------------------------------------------------------------------------
// Wait for lazy charts and images to finish rendering.
// Charts (ECharts, Mermaid, Vega-Lite) are lazily imported and async — they
// need significantly more time than plain markdown to fully paint their SVG/canvas.
// ---------------------------------------------------------------------------
async function waitForRender(el: HTMLElement): Promise<void> {
  // First tick: let React commit the tree
  await new Promise<void>((r) => setTimeout(r, 80));

  // Wait for any <img> elements to load
  const imgs = Array.from(el.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
    )
  );

  // Give lazy-loaded chart bundles (ECharts, Mermaid, Vega-Lite, Markmap) time
  // to dynamically import, initialize, and paint their SVG/canvas content.
  // 3000 ms covers worst-case cold lazy load + multiple ECharts instances init + animation frames.
  await new Promise<void>((r) => setTimeout(r, 3000));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// ---------------------------------------------------------------------------
// React components
// ---------------------------------------------------------------------------

interface MessageRowProps {
  message: UIMessage;
  index: number;
  getMessageText: (msg: UIMessage) => string;
}

function MessageRow({ message, index, getMessageText }: MessageRowProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const prefixedText = formatMessageWithRolePrefix(message.role, text);
  const roleLabel = isUser ? "You" : "Assistant";

  return createElement(
    "div",
    { style: { marginBottom: 32 } },
    createElement(
      "div",
      {
        style: {
          fontSize: 11,
          fontWeight: 600,
          color: isUser ? "#64748b" : "#6366f1",
          marginBottom: 6,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        },
      },
      `${index + 1}. ${roleLabel}`
    ),
    isUser
      ? createElement(
          "div",
          {
            style: {
              background: "#f8fafc",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#1e293b",
              whiteSpace: "pre-wrap" as const,
              wordBreak: "break-word" as const,
            },
          },
          text || "(empty)"
        )
      : createElement(
          "div",
          { style: { fontSize: 14, lineHeight: 1.7, color: "#1e293b" } },
          createElement(MarkdownRenderer, {
            content: prefixedText,
            isStreaming: false,
            enableAlerts: true,
            enableFootnotes: true,
            streamCursor: false,
            forceVisible: true,
          } as Parameters<typeof MarkdownRenderer>[0])
        )
  );
}

function ExportDocument({
  messages,
  getMessageText,
  sessionId,
  exportedAt,
}: {
  messages: UIMessage[];
  getMessageText: (msg: UIMessage) => string;
  sessionId: string;
  exportedAt: Date;
}): ReactNode {
  return createElement(
    "div",
    {
      style: {
        fontFamily:
          '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif',
        padding: "40px 48px",
        background: "#ffffff",
        color: "#0f172a",
        width: 900,
        boxSizing: "border-box" as const,
      },
    },
    createElement(
      "div",
      {
        style: {
          borderBottom: "2px solid #e2e8f0",
          marginBottom: 32,
          paddingBottom: 20,
        },
      },
      createElement(
        "h1",
        { style: { fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" } },
        "Chat Export"
      ),
      createElement(
        "p",
        { style: { fontSize: 12, color: "#64748b", marginTop: 6, marginBottom: 0 } },
        `Session: ${sessionId}  ·  Exported: ${exportedAt.toLocaleString()}`
      )
    ),
    ...messages.map((msg, i) =>
      createElement(MessageRow, { key: msg.id, message: msg, index: i, getMessageText })
    )
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportRenderedChatToPdf(
  messages: UIMessage[],
  getMessageText: (msg: UIMessage) => string,
  sessionId: string,
  filename: string
): Promise<void> {
  if (messages.length === 0) return;

  const exportedAt = new Date();

  // 1. Hidden off-screen container
  const wrapper = document.createElement("div");
  // Must be at position 0,0 (not left:-9999px) so IntersectionObserver fires
  // for chart components that defer rendering until they enter the viewport.
  wrapper.style.cssText =
    "position:fixed;left:0;top:0;width:900px;background:#fff;overflow:visible;z-index:-1;opacity:0;pointer-events:none;";
  document.body.appendChild(wrapper);

  const styleEl = document.createElement("style");
  styleEl.textContent = LIGHT_OVERRIDE_CSS;
  wrapper.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  wrapper.appendChild(mountPoint);

  const root = createRoot(mountPoint);

  // Force light mode on <html> for the duration of the export so that
  // useThemeDetector() inside ECharts/Mermaid/Vega-Lite returns false and
  // charts render with dark-text-on-white colours.  We restore the original
  // value in the finally block so the user never sees a flicker.
  const html = document.documentElement;
  const prevMode = html.getAttribute("data-mode");
  html.setAttribute("data-mode", "light");

  try {
    // 2. Render React tree (ECharts SVG renders natively — no special handling needed)
    await new Promise<void>((resolve) => {
      root.render(
        createElement(ExportDocument, { messages, getMessageText, sessionId, exportedAt })
      );
      requestAnimationFrame(() => resolve());
    });

    // 3. Wait for text/markdown and lazy charts to settle
    await waitForRender(mountPoint);

    // 4. Capture the full container with html2canvas
    const { default: html2canvas } = await import("html2canvas");
    const disabledSheets = disableOklabStylesheets();
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(mountPoint, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: 900,
        windowWidth: 900,
        onclone: (clonedDoc: Document) => {
          sanitizeStylesheets(clonedDoc);
          const s = clonedDoc.createElement("style");
          s.textContent = LIGHT_OVERRIDE_CSS;
          clonedDoc.head.appendChild(s);
          sanitizeInlineColors(clonedDoc);
        },
      });
    } finally {
      for (const sheet of disabledSheets) sheet.disabled = false;
    }

    // 5. Paginate into A4 PDF
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;

    const contentW = pageW - margin * 2;
    const imgWidthMm = contentW;
    const scale = imgWidthMm / (canvas.width / 2);
    const imgHeightMm = (canvas.height / 2) * scale;
    const contentH = pageH - margin * 2;
    const totalPages = Math.ceil(imgHeightMm / contentH);

    const imgData = canvas.toDataURL("image/png");

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();
      const srcYMm = page * contentH;
      pdf.addImage(imgData, "PNG", margin, margin - srcYMm, imgWidthMm, imgHeightMm);
      pdf.setFillColor(255, 255, 255);
      if (srcYMm > 0) pdf.rect(0, 0, pageW, margin, "F");
      pdf.rect(0, pageH - margin, pageW, margin, "F");
    }

    pdf.save(filename);
  } finally {
    // Restore original theme before unmounting
    if (prevMode !== null) {
      html.setAttribute("data-mode", prevMode);
    } else {
      html.removeAttribute("data-mode");
    }
    root.unmount();
    document.body.removeChild(wrapper);
  }
}
