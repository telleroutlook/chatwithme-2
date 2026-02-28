import { useState, useCallback } from "react";
import { Surface, Button } from "@cloudflare/kumo";
import { CopyIcon, CheckIcon, CodeIcon } from "@phosphor-icons/react";

interface CodeBlockProps {
  language: string;
  code: string;
  showCopy?: boolean;
}

export function CodeBlock({ language, code, showCopy = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  return (
    <Surface className="my-3 rounded-xl ring ring-kumo-line overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-kumo-control/50 border-b border-kumo-line">
        <div className="flex items-center gap-2">
          <CodeIcon size={14} className="text-kumo-subtle" />
          <span className="text-xs text-kumo-subtle font-mono">
            {language || "text"}
          </span>
        </div>
        {showCopy && (
          <Button
            variant="secondary"
            size="xs"
            onClick={handleCopy}
            icon={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <pre className="!mt-0 !mb-0 p-4 text-sm">
          <code className={`language-${language}`}>{code}</code>
        </pre>
      </div>
    </Surface>
  );
}
