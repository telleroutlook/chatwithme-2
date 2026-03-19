import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { CheckCircleIcon, PlugIcon } from "@phosphor-icons/react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
export type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_KEY = "chatwithme_theme_mode";
const DARK_MEDIA = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia(DARK_MEDIA).matches ? "dark" : "light";
  }
  return mode;
}

function applyMode(mode: ThemeMode): void {
  const resolvedMode = resolveMode(mode);
  const root = document.documentElement;

  root.setAttribute("data-mode", resolvedMode);
  root.style.colorScheme = resolvedMode;
}

function loadStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_MODE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => loadStoredMode());

  useEffect(() => {
    applyMode(mode);
    localStorage.setItem(THEME_MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA);
    const onChange = () => {
      if (mode === "system") {
        applyMode("system");
      }
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context) {
    return context;
  }
  return {
    mode: "system",
    setMode: () => {}
  };
}

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  labels?: Partial<Record<ConnectionStatus, string>>;
}

export function ConnectionIndicator({ status, labels }: ConnectionIndicatorProps) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const label = labels?.[status] ?? status;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-kumo-subtle" aria-live="polite">
      {isConnected ? (
        <CheckCircleIcon size={14} className="text-[var(--app-color-success)]" weight="fill" />
      ) : (
        <PlugIcon
          size={14}
          className={
            isConnecting ? "text-[var(--app-color-warning)]" : "text-[var(--app-color-danger)]"
          }
        />
      )}
      <span>{label}</span>
    </div>
  );
}

