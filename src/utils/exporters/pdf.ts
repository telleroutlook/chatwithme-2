/**
 * PDF Export Utilities
 * Export content to PDF format
 */

export interface PdfExportOptions {
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter" | [number, number];
  fontSize?: number;
  margin?: number;
  filename?: string;
}

export interface PlainTextPdfOptions extends PdfExportOptions {
  title?: string;
}

const EXPORT_SAFE_STYLE_ID = "pdf-export-safe-style";

function applyExportSafeStyles(clonedDoc: Document): void {
  if (clonedDoc.getElementById(EXPORT_SAFE_STYLE_ID)) return;

  const style = clonedDoc.createElement("style");
  style.id = EXPORT_SAFE_STYLE_ID;
  style.textContent = `
    :root, [data-mode], body {
      color: #0f172a !important;
      background-color: #ffffff !important;
    }

    /* Force simple colors so html2canvas won't parse oklch/color-mix definitions */
    *,
    *::before,
    *::after {
      color: inherit !important;
      border-color: #cbd5e1 !important;
      background-image: none !important;
      text-shadow: none !important;
      box-shadow: none !important;
      filter: none !important;
      backdrop-filter: none !important;
    }
  `;

  clonedDoc.head.appendChild(style);
}

function getHtml2CanvasOptions() {
  return {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#fff",
    onclone: (clonedDoc: Document) => {
      applyExportSafeStyles(clonedDoc);
    }
  };
}

/**
 * Save a PNG data-URL as a single-page auto-oriented PDF.
 * Used by ChartToolbar for canvas-based and dark-mode SVG chart exports.
 */
export async function dataUrlToPdf(dataUrl: string, filename: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  const landscape = img.width > img.height;
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const ratio = Math.min(
    (pageW - margin * 2) / img.width,
    (pageH - margin * 2) / img.height,
  );
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (pageW - w) / 2;

  pdf.addImage(dataUrl, "PNG", x, margin, w, h);
  pdf.save(filename);
}

/**
 * Export DOM element to PDF
 */
export async function exportToPdf(
  element: HTMLElement,
  options: PdfExportOptions = {}
): Promise<void> {
  const {
    orientation = "portrait",
    format = "a4",
    fontSize = 12,
    margin = 10,
    filename = "export.pdf",
  } = options;

  // Dynamic imports
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // Render element to canvas
  const canvas = await html2canvas(element, getHtml2CanvasOptions());

  // Calculate dimensions
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // Create PDF
  const pdf = new jsPDF({
    orientation: imgWidth > imgHeight ? "landscape" : orientation,
    unit: "mm",
    format: format,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Calculate scaled dimensions
  const ratio = Math.min(
    (pageWidth - margin * 2) / imgWidth,
    (pageHeight - margin * 2) / imgHeight
  );

  const scaledWidth = imgWidth * ratio;
  const scaledHeight = imgHeight * ratio;

  // Center the image
  const x = (pageWidth - scaledWidth) / 2;
  const y = margin;

  // Add image to PDF
  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", x, y, scaledWidth, scaledHeight);

  // Save PDF
  pdf.save(filename);
}

/**
 * Export content string to PDF
 */
export async function exportContentToPdf(
  content: string,
  options: PdfExportOptions & { type: "html" | "text" | "markdown" } = { type: "html" }
): Promise<void> {
  const { type: exportType = "html", filename = "export.pdf" } = options;

  // Create temporary container
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 800px;
    background: #fff;
    padding: 16px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: ${options.fontSize || 12}px;
    line-height: 1.6;
    color: #333;
  `;

  if (exportType === "html") {
    // HTML content comes from our own markdown renderer, not arbitrary user input.
    // Use a temporary template to prevent script execution during PDF capture.
    const template = document.createElement("template");
    template.innerHTML = content;
    // Strip any script elements for safety
    template.content.querySelectorAll("script").forEach((el) => el.remove());
    container.appendChild(template.content);
  } else if (exportType === "markdown") {
    // Simple markdown to HTML conversion — escape HTML entities first to prevent XSS
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const html = escaped
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    container.innerHTML = html;
  } else {
    // Plain text — use textContent to prevent XSS
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = content;
    container.appendChild(pre);
  }

  document.body.appendChild(container);

  try {
    await exportToPdf(container, { ...options, filename });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Export multiple pages to PDF
 */
export async function exportMultipleToPdf(
  elements: HTMLElement[],
  options: PdfExportOptions = {}
): Promise<void> {
  const { filename = "export.pdf" } = options;

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const pdf = new jsPDF({
    orientation: options.orientation || "portrait",
    unit: "mm",
    format: options.format || "a4",
  });

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    if (i > 0) {
      pdf.addPage();
    }

    const canvas = await html2canvas(element, getHtml2CanvasOptions());

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const ratio = Math.min(
      (pageWidth - 20) / imgWidth,
      (pageHeight - 20) / imgHeight
    );

    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;

    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 10, 10, scaledWidth, scaledHeight);
  }

  pdf.save(filename);
}

/**
 * Export plain text to PDF without html2canvas/CSS parsing.
 */
export async function exportPlainTextToPdf(
  text: string,
  options: PlainTextPdfOptions = {}
): Promise<void> {
  const {
    orientation = "portrait",
    format = "a4",
    margin = 12,
    fontSize = 11,
    filename = "export.pdf",
    title
  } = options;

  const { default: jsPDF } = await import("jspdf");

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const pxPerMm = 96 / 25.4;
  const renderScale = 2;

  const pageWidthPx = Math.floor(pageWidthMm * pxPerMm * renderScale);
  const pageHeightPx = Math.floor(pageHeightMm * pxPerMm * renderScale);
  const marginPx = Math.floor(margin * pxPerMm * renderScale);
  const contentWidthPx = pageWidthPx - marginPx * 2;
  const contentHeightPx = pageHeightPx - marginPx * 2;

  const baseFontPx = Math.max(12, Math.floor(fontSize * pxPerMm * 0.9 * renderScale));
  const lineHeightPx = Math.floor(baseFontPx * 1.6);
  const titleFontPx = Math.floor(baseFontPx * 1.15);
  const titleGapPx = Math.floor(lineHeightPx * 0.8);

  const fontFamily =
    '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif';

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    throw new Error("Failed to initialize canvas context for PDF export.");
  }
  const textMeasureCtx = measureCtx;

  function wrapLine(input: string, fontPx: number): string[] {
    if (!input) return [""];
    textMeasureCtx.font = `${fontPx}px ${fontFamily}`;
    const out: string[] = [];
    let current = "";
    for (const char of Array.from(input)) {
      const candidate = current + char;
      if (textMeasureCtx.measureText(candidate).width <= contentWidthPx) {
        current = candidate;
        continue;
      }
      if (current) out.push(current);
      current = char;
    }
    if (current) out.push(current);
    return out;
  }

  const pages: string[][] = [];
  let currentPage: string[] = [];
  let remainingHeightPx = contentHeightPx;

  if (title) {
    const titleLines = wrapLine(title, titleFontPx);
    for (const line of titleLines) {
      if (remainingHeightPx < lineHeightPx) {
        pages.push(currentPage);
        currentPage = [];
        remainingHeightPx = contentHeightPx;
      }
      currentPage.push(`__TITLE__${line}`);
      remainingHeightPx -= lineHeightPx;
    }
    remainingHeightPx -= titleGapPx;
  }

  const normalized = text.replace(/\r\n/g, "\n");
  for (const paragraph of normalized.split("\n")) {
    const wrapped = wrapLine(paragraph, baseFontPx);
    for (const line of wrapped) {
      if (remainingHeightPx < lineHeightPx) {
        pages.push(currentPage);
        currentPage = [];
        remainingHeightPx = contentHeightPx;
      }
      currentPage.push(line);
      remainingHeightPx -= lineHeightPx;
    }
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (pages.length === 0) {
    pages.push([""]);
  }

  pages.forEach((lines, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = pageWidthPx;
    pageCanvas.height = pageHeightPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to render PDF page canvas.");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";

    let y = marginPx;
    for (const rawLine of lines) {
      const isTitleLine = rawLine.startsWith("__TITLE__");
      const line = isTitleLine ? rawLine.slice("__TITLE__".length) : rawLine;
      ctx.font = isTitleLine
        ? `600 ${titleFontPx}px ${fontFamily}`
        : `400 ${baseFontPx}px ${fontFamily}`;
      ctx.fillText(line, marginPx, y);
      y += lineHeightPx;
    }

    const image = pageCanvas.toDataURL("image/png");
    pdf.addImage(image, "PNG", 0, 0, pageWidthMm, pageHeightMm);
  });

  pdf.save(filename);
}
