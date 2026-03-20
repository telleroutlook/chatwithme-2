/**
 * Client-side file parser for chat attachments.
 *
 * Reads common file types and converts them to text content
 * that can be included in a chat message for AI analysis.
 *
 * Supported formats:
 *   Text:  csv, json, txt, md, xml, yaml, toml, tsv, sql, html, css, js/ts, py, etc.
 *   Excel: xlsx, xls (via SheetJS, lazy-loaded)
 *   PDF:   pdf (via pdfjs-dist, lazy-loaded)
 *   Word:  docx (via mammoth, lazy-loaded)
 *   Image: png, jpg, gif, webp, svg (metadata only)
 */

// ============ Types ============

export interface ParsedFile {
  name: string;
  type: string;
  size: number;
  /** Text content extracted from the file */
  content: string;
}

// ============ Constants ============

/** Maximum file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Human-readable max size label */
export const MAX_FILE_SIZE_LABEL = "10MB";

/** Text-based extensions — read directly as UTF-8 */
const TEXT_EXTENSIONS = new Set([
  "csv", "json", "txt", "md", "markdown",
  "xml", "yaml", "yml", "toml", "ini", "conf", "cfg", "log",
  "tsv", "sql", "html", "htm", "css",
  "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs",
  "java", "c", "cpp", "h", "sh", "bash", "zsh",
  "env", "gitignore", "properties",
]);

// ============ Helpers ============

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === filename.length - 1) return "";
  return filename.slice(dotIndex + 1).toLowerCase();
}

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  const textual = [
    "application/json", "application/xml", "application/x-yaml",
    "application/toml", "application/sql",
    "application/javascript", "application/typescript",
  ];
  return textual.includes(mime);
}

// ============ Core Parser ============

/**
 * Check if a file is supported for parsing.
 */
export function isFileSupported(file: File): boolean {
  const ext = getExtension(file.name);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (isTextMime(file.type)) return true;
  if (ext === "xlsx" || ext === "xls") return true;
  if (ext === "pdf") return true;
  if (ext === "docx") return true;
  if (file.type.startsWith("image/")) return true;
  return false;
}

/**
 * Read a text file as UTF-8 string.
 */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "utf-8");
  });
}

/**
 * Read a file as ArrayBuffer.
 */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse an Excel file (.xlsx/.xls) into CSV text.
 */
async function parseExcel(file: File): Promise<string> {
  const buffer = await readAsArrayBuffer(file);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (workbook.SheetNames.length > 1) {
      lines.push(`--- Sheet: ${sheetName} ---`);
    }
    lines.push(csv);
  }
  return lines.join("\n");
}

/**
 * Parse a PDF file into text.
 */
async function parsePdf(file: File): Promise<string> {
  const buffer = await readAsArrayBuffer(file);
  const pdfjs = await import("pdfjs-dist");

  // Use the bundled worker
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];

  const pageCount = Math.min(doc.numPages, 50); // Cap at 50 pages
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    if (text.trim()) {
      pages.push(text);
    }
  }

  if (doc.numPages > 50) {
    pages.push(`\n[... truncated: showing 50 of ${doc.numPages} pages]`);
  }

  return pages.join("\n\n");
}

/**
 * Parse a Word .docx file into text.
 */
async function parseDocx(file: File): Promise<string> {
  const buffer = await readAsArrayBuffer(file);
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

/**
 * Parse a single file and return its text content.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE_LABEL}`);
  }

  const ext = getExtension(file.name);

  // Excel files
  if (ext === "xlsx" || ext === "xls") {
    const content = await parseExcel(file);
    return { name: file.name, type: "spreadsheet", size: file.size, content };
  }

  // PDF files
  if (ext === "pdf") {
    const content = await parsePdf(file);
    return { name: file.name, type: "pdf", size: file.size, content };
  }

  // Word documents
  if (ext === "docx") {
    const content = await parseDocx(file);
    return { name: file.name, type: "docx", size: file.size, content };
  }

  // Image files — metadata only (model can't see the image)
  if (file.type.startsWith("image/")) {
    return {
      name: file.name,
      type: "image",
      size: file.size,
      content: `[Image file: ${file.name} (${formatFileSize(file.size)}, ${file.type})]`,
    };
  }

  // Text-based files
  if (TEXT_EXTENSIONS.has(ext) || isTextMime(file.type)) {
    const content = await readAsText(file);
    return { name: file.name, type: ext || "text", size: file.size, content };
  }

  throw new Error(`Unsupported file type: ${ext || file.type}`);
}

/**
 * Format a parsed file's content for inclusion in a chat message.
 */
export function formatFileForMessage(parsed: ParsedFile): string {
  const header = `📎 **${parsed.name}** (${formatFileSize(parsed.size)})`;
  const ext = getExtension(parsed.name);

  // Code-like files → fenced code block
  const codeExts = new Set([
    "json", "xml", "yaml", "yml", "toml", "sql",
    "html", "css", "js", "ts", "jsx", "tsx",
    "py", "rb", "go", "rs", "java", "c", "cpp", "h", "sh",
  ]);

  if (codeExts.has(ext)) {
    return `${header}\n\`\`\`${ext}\n${parsed.content}\n\`\`\``;
  }

  // CSV / TSV / spreadsheet → csv code block
  if (ext === "csv" || ext === "tsv" || parsed.type === "spreadsheet") {
    return `${header}\n\`\`\`csv\n${parsed.content}\n\`\`\``;
  }

  // Everything else → plain text (PDF, DOCX, MD, TXT, images)
  return `${header}\n${parsed.content}`;
}

/**
 * Format bytes into human-readable size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
