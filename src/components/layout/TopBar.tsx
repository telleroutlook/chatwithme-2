import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text } from "@cloudflare/kumo";
import {
  CaretDownIcon,
  GlobeHemisphereWestIcon,
  ListIcon,
  MonitorIcon,
  MoonIcon,
  PlugsConnectedIcon,
  SlidersHorizontalIcon,
  SunIcon
} from "@phosphor-icons/react";
import {
  ConnectionIndicator,
  useThemeMode,
  type ThemeMode,
  type ConnectionStatus,
} from "../AgentsUiCompat";

interface TopBarProps {
  mobile: boolean;
  onToggleSidebar: () => void;
  connectionStatus: ConnectionStatus;
  lang: "zh" | "en";
  setLang: (lang: "zh" | "en") => void;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function TopBar({
  mobile,
  onToggleSidebar,
  connectionStatus,
  lang,
  setLang,
  t,
}: TopBarProps) {
  const { mode, setMode } = useThemeMode();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const themeLabel = useMemo(() => {
    if (mode === "light") return t("theme_light");
    if (mode === "dark") return t("theme_dark");
    return t("theme_system");
  }, [mode, t]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const themeOptions: Array<{
    value: ThemeMode;
    label: string;
    icon: ReactNode;
  }> = [
    { value: "system", label: t("theme_system"), icon: <MonitorIcon size={14} /> },
    { value: "light", label: t("theme_light"), icon: <SunIcon size={14} /> },
    { value: "dark", label: t("theme_dark"), icon: <MoonIcon size={14} /> }
  ];

  const langOptions: Array<{ value: "en" | "zh"; label: string }> = [
    { value: "en", label: t("lang_en") },
    { value: "zh", label: t("lang_zh") }
  ];

  return (
    <header className="app-glass border-b border-kumo-line/80 bg-kumo-base/70 px-3 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 transition-colors hover:bg-kumo-control focus-visible:outline-none"
            aria-label={mobile ? t("sidebar_open") : t("sidebar_toggle")}
          >
            <ListIcon size={20} className="text-kumo-subtle" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <PlugsConnectedIcon size={22} className="shrink-0 text-kumo-accent" weight="bold" />
            <div>
              <h1 className="text-base font-semibold leading-tight text-kumo-default sm:text-lg">
                {t("app_title")}
              </h1>
              <Text size="xs" variant="secondary">{t("app_subtitle")}</Text>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectionIndicator
            status={connectionStatus}
            labels={{
              connecting: t("connection_connecting"),
              connected: t("connection_connected"),
              disconnected: t("connection_disconnected"),
            }}
          />
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border-default)] bg-[var(--app-surface-secondary)] px-2.5 text-xs text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-tertiary)]"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`${t("theme_group")} / ${t("lang_group")}`}
            >
              <SlidersHorizontalIcon size={14} />
              <span>{lang.toUpperCase()}</span>
              <span className="hidden text-[var(--app-text-muted)] sm:inline">
                · {themeLabel}
              </span>
              <CaretDownIcon size={12} />
            </button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[var(--app-border-default)] bg-[var(--surface-elevated)] p-2 shadow-[var(--app-shadow-medium)]"
              >
                <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                  {t("theme_group")}
                </div>
                <div className="space-y-1 pb-2">
                  {themeOptions.map((option) => {
                    const active = option.value === mode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setMode(option.value);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-[var(--app-accent)] text-[var(--app-text-on-accent)]"
                            : "text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-secondary)]"
                        }`}
                        aria-pressed={active}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {option.icon}
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-px bg-[var(--app-border-default)]" />
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                  {t("lang_group")}
                </div>
                <div className="space-y-1">
                  {langOptions.map((option) => {
                    const active = option.value === lang;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setLang(option.value);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-[var(--app-accent)] text-[var(--app-text-on-accent)]"
                            : "text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-secondary)]"
                        }`}
                        aria-pressed={active}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <GlobeHemisphereWestIcon size={14} />
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
