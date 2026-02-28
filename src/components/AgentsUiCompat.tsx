import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  CheckCircleIcon,
  MoonIcon,
  PlugIcon,
  SunIcon,
  MonitorIcon
} from "@phosphor-icons/react";

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

interface ModeOption {
  value: ThemeMode;
  icon: ReactNode;
  label: string;
}

interface ModeToggleLabels {
  light: string;
  dark: string;
  system: string;
  group: string;
}

const DEFAULT_MODE_LABELS: ModeToggleLabels = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System mode",
  group: "Theme mode"
};

export function ModeToggle({
  labels = DEFAULT_MODE_LABELS
}: {
  labels?: ModeToggleLabels;
}) {
  const theme = useContext(ThemeContext);
  const mode = theme?.mode ?? "system";
  const setMode = theme?.setMode;

  const modeOptions: ModeOption[] = useMemo(
    () => [
      { value: "light", icon: <SunIcon size={16} />, label: labels.light },
      { value: "dark", icon: <MoonIcon size={16} />, label: labels.dark },
      { value: "system", icon: <MonitorIcon size={16} />, label: labels.system }
    ],
    [labels.dark, labels.light, labels.system]
  );

  const onSelect = useCallback(
    (value: ThemeMode) => {
      setMode?.(value);
    },
    [setMode]
  );

  return (
    <div
      role="group"
      aria-label={labels.group}
      className="inline-flex items-center rounded-lg border border-[var(--app-border-default)] bg-[var(--app-surface-secondary)] p-1"
    >
      {modeOptions.map((option) => {
        const active = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-label={option.label}
            aria-pressed={active}
            title={option.label}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-[var(--app-accent)] text-[var(--app-text-on-accent)]"
                : "text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-tertiary)]"
            ].join(" ")}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}

export function PoweredByAgents({ label }: { label?: string }) {
  return <span className="text-xs text-kumo-subtle">{label ?? "Powered by Agents"}</span>;
}
