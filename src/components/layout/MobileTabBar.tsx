import { ChatCircleIcon, PlugIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type Tab = "chat" | "mcp";

interface MobileTabBarProps {
  value: Tab;
  onChange: (tab: Tab) => void;
  labels: {
    chat: string;
    mcp: string;
  };
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 px-4 py-2 text-xs transition-colors ${
        active ? "text-kumo-accent" : "text-kumo-subtle hover:text-kumo-default"
      }`}
      style={{ minHeight: 44 }}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function MobileTabBar({ value, onChange, labels }: MobileTabBarProps) {
  return (
    <nav
      className="app-glass fixed bottom-0 left-0 right-0 z-30 border-t border-kumo-line/80 bg-kumo-base/90 md:hidden"
      style={{
        paddingBottom: "var(--safe-area-inset-bottom)"
      }}
    >
      <div className="flex">
        <TabButton
          active={value === "chat"}
          icon={<ChatCircleIcon size={20} weight="bold" />}
          label={labels.chat}
          onClick={() => onChange("chat")}
        />
        <TabButton
          active={value === "mcp"}
          icon={<PlugIcon size={20} weight="bold" />}
          label={labels.mcp}
          onClick={() => onChange("mcp")}
        />
      </div>
    </nav>
  );
}
