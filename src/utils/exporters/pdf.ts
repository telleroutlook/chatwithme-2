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
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#fff",
  });

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
    container.innerHTML = content;
  } else if (exportType === "markdown") {
    // Simple markdown to HTML conversion
    const html = content
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    container.innerHTML = html;
  } else {
    container.innerHTML = `<pre style="white-space: pre-wrap;">${content}</pre>`;
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

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#fff",
    });

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
