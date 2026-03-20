/**
 * Image Export Utilities
 * Export content to PNG/JPEG format
 */

export interface ExportOptions {
  quality?: number;
  pixelRatio?: number;
  backgroundColor?: string;
  filename?: string;
}

/**
 * Capture DOM element as PNG data-URL (does not download).
 */
export async function toPngDataUrl(
  element: HTMLElement,
  options: Omit<ExportOptions, "filename"> = {}
): Promise<string> {
  const {
    quality = 1,
    pixelRatio = 2,
    backgroundColor = "#fff",
  } = options;

  const { toPng } = await import("html-to-image");
  return toPng(element, { quality, pixelRatio, backgroundColor });
}

/**
 * Export DOM element to PNG
 */
export async function exportToPng(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const { filename = "export.png" } = options;
  const dataUrl = await toPngDataUrl(element, options);
  downloadFile(dataUrl, filename);
}

/**
 * Export DOM element to JPEG
 */
export async function exportToJpeg(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const {
    quality = 0.92,
    pixelRatio = 2,
    backgroundColor = "#fff",
    filename = "export.jpg",
  } = options;

  const { toJpeg } = await import("html-to-image");

  const dataUrl = await toJpeg(element, {
    quality,
    pixelRatio,
    backgroundColor,
  });

  downloadFile(dataUrl, filename);
}

/**
 * Export SVG string to PNG
 */
export async function exportSvgToPng(
  svgContent: string,
  options: ExportOptions = {}
): Promise<void> {
  const { filename = "export.png", backgroundColor = "#fff" } = options;

  // Create a temporary container
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 800px;
    background: ${backgroundColor};
    padding: 16px;
  `;
  container.innerHTML = svgContent;
  document.body.appendChild(container);

  try {
    await exportToPng(container, { ...options, filename });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Export content string to image
 * Renders content to temporary DOM and exports
 */
export async function exportContentToImage(
  content: string,
  options: ExportOptions & { type: "html" | "svg" | "markdown" } = { type: "html" }
): Promise<void> {
  const { type: exportType = "html", filename = "export.png" } = options;

  // Create temporary container
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 800px;
    background: ${options.backgroundColor || "#fff"};
    padding: 16px;
  `;

  if (exportType === "svg" || exportType === "html") {
    container.innerHTML = content;
  } else if (exportType === "markdown") {
    // Plain text — use textContent to prevent XSS
    const pre = document.createElement("pre");
    pre.textContent = content;
    container.appendChild(pre);
  }

  document.body.appendChild(container);

  try {
    await exportToPng(container, { ...options, filename });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Trigger file download
 */
export function downloadFile(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Export string content as text file
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  const blob = new Blob([content], { type: mimeType });
  const dataUrl = URL.createObjectURL(blob);
  downloadFile(dataUrl, filename);
  URL.revokeObjectURL(dataUrl);
}
