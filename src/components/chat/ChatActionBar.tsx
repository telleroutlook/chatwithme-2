import {
  LightningIcon,
  WrenchIcon,
  ClockCounterClockwiseIcon,
  PlayIcon,
  ArticleIcon,
  RobotIcon,
  FileIcon,
  HandTapIcon,
} from "@phosphor-icons/react";
import { useResponsive } from "../../hooks/useResponsive";
import type { CommandSuggestionItem, CommandSection } from "../../types/command";

interface ChatActionBarProps {
  groups: Array<{ section: CommandSection; items: CommandSuggestionItem[] }>;
  activeIndex: number;
  onSelect: (item: CommandSuggestionItem) => void;
  title: string;
}

// Section icons mapping
const SECTION_ICONS: Record<CommandSection, React.ReactNode> = {
  tools: <WrenchIcon size={12} />,
  sessions: <ClockCounterClockwiseIcon size={12} />,
  actions: <PlayIcon size={12} />,
  prompts: <ArticleIcon size={12} />,
  models: <RobotIcon size={12} />,
  files: <FileIcon size={12} />,
};

// Section labels mapping
const SECTION_LABELS: Record<CommandSection, string> = {
  tools: "Tools",
  sessions: "Sessions",
  actions: "Actions",
  prompts: "Prompts",
  models: "Models",
  files: "Files",
};

export function ChatActionBar({ groups, activeIndex, onSelect, title }: ChatActionBarProps) {
  const { mobile, touch } = useResponsive();
  let globalIndex = -1;

  // Calculate total items for keyboard navigation hint
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  // On mobile/touch, use touch-friendly hints and larger tap areas
  const isTouchDevice = mobile || touch;

  return (
    <div className="mx-2.5 mb-2 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-primary)]/95 p-2 shadow-[var(--app-shadow-soft)] backdrop-blur-sm">
      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
          <LightningIcon size={12} />
          <span className="text-xs text-foreground">{title}</span>
        </div>
        <span className="text-xs text-foreground-muted">
          {totalItems} items
        </span>
      </div>

      {/* Groups */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {groups.map((group) => {
          const sectionIcon = SECTION_ICONS[group.section];
          const sectionLabel = SECTION_LABELS[group.section] ?? group.section;

          return (
            <div key={group.section}>
              {/* Section header */}
              <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--app-text-muted)]">
                {sectionIcon}
                <span>{sectionLabel}</span>
                <span className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-surface-secondary text-foreground-muted">
                  {group.items.length}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  globalIndex += 1;
                  const isActive = globalIndex === activeIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelect(item)}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 text-left transition-colors active:scale-[0.98] ${
                        isTouchDevice ? "py-3 min-h-[44px]" : "py-2"
                      } ${
                        isActive
                          ? "bg-[var(--app-surface-secondary)] ring-1 ring-[var(--app-border-default)]"
                          : "hover:bg-[var(--app-surface-secondary)]/60"
                      }`}
                    >
                      {/* Trigger + Value */}
                      <div className="flex-shrink-0 font-mono text-xs">
                        <span className="text-[var(--app-accent)]">{item.trigger}</span>
                        <span className="text-foreground">{item.value}</span>
                      </div>

                      {/* Label + Description + Badge */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--app-text-primary)]">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-surface-secondary text-foreground-muted">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--app-text-muted)]">
                            {item.description}
                          </span>
                        )}
                      </div>

                      {/* Icon */}
                      {item.icon && (
                        <div className="flex-shrink-0 text-[var(--app-text-muted)]">
                          {item.icon}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Keyboard/Touch hint - responsive based on device type */}
      {isTouchDevice ? (
        <div className="mt-2 flex items-center justify-center gap-2 border-t border-[var(--app-border-default)] pt-1.5">
          <HandTapIcon size={12} className="text-[var(--app-text-muted)]" />
          <span className="text-xs text-foreground-muted">
            Tap to select
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center gap-2 border-t border-[var(--app-border-default)] pt-1.5">
          <span className="text-xs text-foreground-muted">
            <kbd className="rounded bg-[var(--app-surface-secondary)] px-1.5 py-0.5 font-mono text-[10px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span className="text-xs text-foreground-muted">
            <kbd className="rounded bg-[var(--app-surface-secondary)] px-1.5 py-0.5 font-mono text-[10px]">
              Tab
            </kbd>{" "}
            select
          </span>
          <span className="text-xs text-foreground-muted">
            <kbd className="rounded bg-[var(--app-surface-secondary)] px-1.5 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            close
          </span>
        </div>
      )}
    </div>
  );
}
