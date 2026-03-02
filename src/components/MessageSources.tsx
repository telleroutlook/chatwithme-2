import { useMemo, useState } from "react";
import {
  CaretDownIcon,
  CaretRightIcon,
  FilesIcon,
  ArrowSquareOutIcon,
  StarIcon,
} from "@phosphor-icons/react";
import { Text, Badge } from "@cloudflare/kumo";
import { extractMessageSources, type MessageSourceGroup } from "../types/message-sources";

interface MessageSourcesProps {
  parts?: unknown;
  groups?: MessageSourceGroup[];
  title: string;
  emptyLabel: string;
  /** Whether to show relevance scores */
  showScores?: boolean;
  /** Whether to enable hover preview */
  enableHoverPreview?: boolean;
  /** Max preview length */
  maxPreviewLength?: number;
}

/**
 * Score badge component with color coding
 */
function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return null;

  const percentage = Math.round(score * 100);
  const colorClass =
    score >= 0.8
      ? "text-green-600 bg-green-50 dark:bg-green-900/20"
      : score >= 0.6
        ? "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
        : "text-gray-600 bg-gray-50 dark:bg-gray-900/20";

  return (
    <Badge className={`text-[10px] ${colorClass}`}>
      <StarIcon size={10} className="mr-0.5" weight="fill" />
      {percentage}%
    </Badge>
  );
}

/**
 * Chunk preview with hover effect
 */
function ChunkPreview({
  preview,
  maxPreviewLength = 200,
}: {
  preview: string;
  maxPreviewLength?: number;
}) {
  const truncated = preview.length > maxPreviewLength;
  const displayText = truncated ? `${preview.slice(0, maxPreviewLength)}...` : preview;

  return (
    <Text size="xs" variant="secondary">
      <span className="leading-relaxed">{displayText}</span>
    </Text>
  );
}

export function MessageSources({
  parts,
  groups: providedGroups,
  title,
  emptyLabel,
  showScores = true,
  maxPreviewLength = 200,
}: MessageSourcesProps) {
  const groups = useMemo(
    () => providedGroups ?? extractMessageSources(parts),
    [providedGroups, parts]
  );
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [expandedAll, setExpandedAll] = useState(false);

  if (groups.length === 0) {
    return null;
  }

  const totalChunks = groups.reduce((sum, group) => sum + group.chunks.length, 0);
  const avgScore =
    groups.reduce((sum, group) => {
      const groupAvg =
        group.chunks.reduce((s, c) => s + (c.score ?? 0), 0) / (group.chunks.length || 1);
      return sum + groupAvg;
    }, 0) / groups.length;

  const toggleAll = () => {
    const newExpandedAll = !expandedAll;
    const newOpenIds: Record<string, boolean> = {};
    if (newExpandedAll) {
      groups.forEach((g) => (newOpenIds[g.id] = true));
    }
    setOpenIds(newOpenIds);
    setExpandedAll(newExpandedAll);
  };

  return (
    <div className="mt-2 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-secondary)]/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--app-border-default)] bg-[var(--app-surface-secondary)]">
        <div className="flex items-center gap-2">
          <FilesIcon size={14} className="text-[var(--app-text-muted)]" />
          <Text size="xs" bold>
            {title}
          </Text>
          <Badge variant="secondary">{totalChunks}</Badge>
          {showScores && avgScore > 0 && (
            <ScoreBadge score={avgScore} />
          )}
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] text-kumo-accent hover:underline"
        >
          {expandedAll ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* Groups */}
      <div className="p-2 space-y-1.5">
        {groups.map((group) => {
          const open = !!openIds[group.id];
          const groupScore =
            group.chunks.reduce((s, c) => s + (c.score ?? 0), 0) / (group.chunks.length || 1);

          return (
            <div
              key={group.id}
              className="rounded-lg border border-[var(--app-border-default)] bg-[var(--app-surface-primary)]/80 overflow-hidden"
            >
              {/* Group header */}
              <button
                type="button"
                onClick={() => {
                  setOpenIds((current) => ({ ...current, [group.id]: !current[group.id] }));
                  setExpandedAll(false);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--app-surface-secondary)]/30 transition-colors"
                aria-expanded={open}
              >
                <span className="text-[var(--app-text-muted)]">
                  {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
                </span>
                <span className="truncate text-xs font-medium flex-1">{group.title}</span>
                {showScores && groupScore > 0 && <ScoreBadge score={groupScore} />}
                <Badge variant="secondary" className="text-[10px]">
                  {group.chunks.length}
                </Badge>
              </button>

              {/* Chunks */}
              {open && (
                <div className="border-t border-[var(--app-border-default)] divide-y divide-[var(--app-border-default)]/50">
                  {group.chunks.length === 0 ? (
                    <div className="px-2.5 py-2">
                      <Text size="xs" variant="secondary">
                        {emptyLabel}
                      </Text>
                    </div>
                  ) : (
                    group.chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="px-2.5 py-2 hover:bg-[var(--app-surface-secondary)]/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <ChunkPreview
                              preview={chunk.preview}
                              maxPreviewLength={maxPreviewLength}
                            />
                          </div>
                          {showScores && chunk.score !== undefined && (
                            <ScoreBadge score={chunk.score} />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* External link */}
              {group.url && (
                <div className="border-t border-[var(--app-border-default)]/50 px-2.5 py-1.5 bg-[var(--app-surface-secondary)]/20">
                  <a
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-kumo-accent hover:underline"
                  >
                    <ArrowSquareOutIcon size={12} />
                    View source
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
