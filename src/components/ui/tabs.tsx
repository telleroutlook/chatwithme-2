import type { ReactNode } from "react";
import { cn } from "./utils";

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: Array<{
    value: T;
    label: ReactNode;
    badge?: ReactNode;
    icon?: ReactNode;
  }>;
  ariaLabel: string;
}

export function Tabs<T extends string>({ value, onChange, items, ariaLabel }: TabsProps<T>) {
  return (
    <div className="flex gap-2 py-2" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium border transition-colors",
              active
                ? "border-[var(--app-accent)] text-[var(--app-accent)] bg-[color-mix(in_oklab,var(--app-accent)_12%,transparent)]"
                : "border-[var(--app-border-default)] text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)] hover:bg-[var(--app-surface-secondary)]"
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
