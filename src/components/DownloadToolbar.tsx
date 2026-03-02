import { useState, memo, useCallback } from "react";
import { Button, Popover } from "@cloudflare/kumo";
import {
  DownloadIcon,
  FileTextIcon,
  CodeIcon,
  FilePdfIcon,
  ImageIcon,
  LightningIcon,
} from "@phosphor-icons/react";
import { downloadTextFile } from "../utils/exporters/image";
import { exportContentToPdf } from "../utils/exporters/pdf";

interface DownloadToolbarProps {
  content: string;
  filename?: string;
  type?: "html" | "markdown" | "svg" | "text";
  elementRef?: React.RefObject<HTMLElement>;
}

interface DownloadFormat {
  type: string;
  label: string;
  icon: React.ReactNode;
  handler: (content: string, filename: string, elementRef?: React.RefObject<HTMLElement>) => Promise<void> | void;
}

const DOWNLOAD_FORMATS: DownloadFormat[] = [
  {
    type: "txt",
    label: "Plain Text",
    icon: <FileTextIcon size={16} />,
    handler: (content, filename) => {
      downloadTextFile(content, `${filename}.txt`, "text/plain");
    },
  },
  {
    type: "md",
    label: "Markdown",
    icon: <LightningIcon size={16} />,
    handler: (content, filename) => {
      downloadTextFile(content, `${filename}.md`, "text/markdown");
    },
  },
  {
    type: "html",
    label: "HTML",
    icon: <CodeIcon size={16} />,
    handler: (content, filename) => {
      const fullHtml = wrapAsHtmlDocument(content);
      downloadTextFile(fullHtml, `${filename}.html`, "text/html");
    },
  },
  {
    type: "png",
    label: "PNG Image",
    icon: <ImageIcon size={16} />,
    handler: async (content, filename, elementRef) => {
      const { exportContentToImage } = await import("../utils/exporters/image");
      await exportContentToImage(content, {
        type: "html",
        filename: `${filename}.png`,
        backgroundColor: "#fff",
      });
    },
  },
  {
    type: "pdf",
    label: "PDF",
    icon: <FilePdfIcon size={16} />,
    handler: async (content, filename) => {
      await exportContentToPdf(content, {
        type: "html",
        filename: `${filename}.pdf`,
      });
    },
  },
];

/**
 * Wrap content as a complete HTML document
 */
function wrapAsHtmlDocument(content: string): string {
  // Check if already a complete document
  if (/<(!doctype|html)\b/i.test(content)) {
    return content;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Content</title>
  <style>
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}

export const DownloadToolbar = memo(function DownloadToolbar({
  content,
  filename = "content",
  elementRef,
}: DownloadToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: DownloadFormat) => {
      setIsExporting(format.type);
      try {
        await format.handler(content, filename, elementRef);
        setIsOpen(false);
      } catch (err) {
        console.error(`Failed to export as ${format.type}:`, err);
      } finally {
        setIsExporting(null);
      }
    },
    [content, filename, elementRef]
  );

  return (
    <div className="download-toolbar">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <Button variant="ghost" size="sm">
            <DownloadIcon size={16} className="mr-1" />
            <span>Export</span>
          </Button>
        </Popover.Trigger>
        <Popover.Content className="w-48 p-2">
          <div className="flex flex-col gap-1">
            {DOWNLOAD_FORMATS.map((format) => (
              <Button
                key={format.type}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => handleExport(format)}
                disabled={isExporting !== null}
              >
                {format.icon}
                <span className="ml-2 flex-1 text-left">{format.label}</span>
                {isExporting === format.type && (
                  <span className="text-xs text-kumo-subtle">Exporting...</span>
                )}
              </Button>
            ))}
          </div>
        </Popover.Content>
      </Popover>
    </div>
  );
});

/**
 * Compact download button for inline use
 */
export const DownloadButton = memo(function DownloadButton({
  content,
  filename = "content",
  format = "txt",
}: DownloadToolbarProps & { format?: string }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    const formatConfig = DOWNLOAD_FORMATS.find((f) => f.type === format);
    if (!formatConfig) return;

    setIsExporting(true);
    try {
      await formatConfig.handler(content, filename);
    } catch (err) {
      console.error(`Failed to export:`, err);
    } finally {
      setIsExporting(false);
    }
  }, [content, filename, format]);

  return (
    <Button variant="secondary" size="xs" onClick={handleExport} disabled={isExporting}>
      <DownloadIcon size={12} />
      {isExporting ? "Exporting..." : "Download"}
    </Button>
  );
});
