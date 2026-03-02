/**
 * GitHub-style Markdown Alert components
 * Supports NOTE, TIP, IMPORTANT, WARNING, CAUTION alert types
 */

import { memo, type ReactNode } from "react";
import { Info, Lightbulb, Star, Warning, WarningOctagon } from "@phosphor-icons/react";

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

interface MarkdownAlertProps {
  type: AlertType;
  children: ReactNode;
}

const alertConfig: Record<AlertType, {
  icon: typeof Info;
  label: string;
  containerClass: string;
  iconClass: string;
  borderClass: string;
  bgClass: string;
}> = {
  note: {
    icon: Info,
    label: "Note",
    containerClass: "border-l-4 border-blue-500/60 bg-blue-500/10",
    iconClass: "text-blue-500",
    borderClass: "border-blue-500/30",
    bgClass: "bg-blue-500/5"
  },
  tip: {
    icon: Lightbulb,
    label: "Tip",
    containerClass: "border-l-4 border-emerald-500/60 bg-emerald-500/10",
    iconClass: "text-emerald-500",
    borderClass: "border-emerald-500/30",
    bgClass: "bg-emerald-500/5"
  },
  important: {
    icon: Star,
    label: "Important",
    containerClass: "border-l-4 border-purple-500/60 bg-purple-500/10",
    iconClass: "text-purple-500",
    borderClass: "border-purple-500/30",
    bgClass: "bg-purple-500/5"
  },
  warning: {
    icon: Warning,
    label: "Warning",
    containerClass: "border-l-4 border-amber-500/60 bg-amber-500/10",
    iconClass: "text-amber-500",
    borderClass: "border-amber-500/30",
    bgClass: "bg-amber-500/5"
  },
  caution: {
    icon: WarningOctagon,
    label: "Caution",
    containerClass: "border-l-4 border-red-500/60 bg-red-500/10",
    iconClass: "text-red-500",
    borderClass: "border-red-500/30",
    bgClass: "bg-red-500/5"
  }
};

export const MarkdownAlert = memo(function MarkdownAlert({
  type,
  children
}: MarkdownAlertProps): ReactNode {
  const config = alertConfig[type];
  const IconComponent = config.icon;

  return (
    <div className={`my-4 rounded-r-md ${config.containerClass}`}>
      <div className={`flex items-start gap-2 p-3 ${config.bgClass} rounded-tr-md border-b ${config.borderClass}`}>
        <IconComponent
          size={18}
          weight="fill"
          className={`${config.iconClass} flex-shrink-0 mt-0.5`}
        />
        <span className={`font-semibold text-sm ${config.iconClass}`}>
          {config.label}
        </span>
      </div>
      <div className="px-4 py-3 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
});

/**
 * Parse alert type from blockquote content
 * Returns null if not a valid alert
 */
export function parseAlertType(content: string): AlertType | null {
  const match = content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
  if (!match) return null;
  return match[1].toLowerCase() as AlertType;
}

/**
 * Remove alert marker from content
 */
export function stripAlertMarker(content: string): string {
  return content.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, "");
}
