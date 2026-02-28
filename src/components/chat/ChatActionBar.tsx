import { Text } from "@cloudflare/kumo";
import { LightningIcon } from "@phosphor-icons/react";
import type { CommandSuggestionItem } from "../../types/command";

interface ChatActionBarProps {
  groups: Array<{ section: string; items: CommandSuggestionItem[] }>;
  activeIndex: number;
  onSelect: (item: CommandSuggestionItem) => void;
  title: string;
}

export function ChatActionBar({ groups, activeIndex, onSelect, title }: ChatActionBarProps) {
  let globalIndex = -1;

  return (
    <div className="mx-2.5 mb-2 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-primary)]/95 p-2 shadow-[var(--app-shadow-soft)]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
        <LightningIcon size={12} />
        <Text size="xs">{title}</Text>
      </div>
      <div className="space-y-1">
        {groups.map((group) => (
          <div key={group.section}>
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--app-text-muted)]">
              {group.section}
            </div>
            {group.items.map((item) => {
              globalIndex += 1;
              const isActive = globalIndex === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(item)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left ${
                    isActive
                      ? "bg-[var(--app-surface-secondary)]"
                      : "hover:bg-[var(--app-surface-secondary)]/70"
                  }`}
                >
                  <span className="font-mono text-xs text-[var(--app-accent)]">
                    {item.trigger}
                    {item.value}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-[var(--app-text-primary)]">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="block truncate text-[11px] text-[var(--app-text-muted)]">
                        {item.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
