import { useEffect, useState, type ReactNode } from "react";
import { CheckCircleIcon, MoonIcon, PlugIcon, SunIcon } from "@phosphor-icons/react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-kumo-subtle" aria-live="polite">
      {isConnected ? (
        <CheckCircleIcon size={14} className="text-green-500" weight="fill" />
      ) : (
        <PlugIcon size={14} className={isConnecting ? "text-amber-500" : "text-red-500"} />
      )}
      <span>{status}</span>
    </div>
  );
}

export function ModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((value) => !value)}
      className="p-2 rounded-lg hover:bg-kumo-control transition-colors"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}

export function PoweredByAgents() {
  return <span className="text-xs text-kumo-subtle">Powered by Agents</span>;
}
