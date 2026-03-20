import { useEffect, useRef, useState } from "react";
import {
  CaretDownIcon,
  DownloadSimpleIcon,
  ListIcon,
  MoonIcon,
  PlusIcon,
  SunIcon
} from "@phosphor-icons/react";
import { ConnectionIndicator, type ConnectionStatus, useThemeMode } from "../AgentsUiCompat";
import { cn } from "../ui/utils";
import { useResponsive } from "../../hooks/useResponsive";
import { UserMenu } from "../../features/auth/components/UserMenu";

interface TopBarProps {
  mobile: boolean;
  onToggleSidebar: () => void;
  onNewSession: () => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  disableExportAll?: boolean;
  connectionStatus: ConnectionStatus;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function TopBar({
  mobile,
  onToggleSidebar,
  onNewSession,
  onExportMarkdown,
  onExportPdf,
  disableExportAll = false,
  connectionStatus,
  t
}: TopBarProps) {
  const { mode, setMode } = useThemeMode();
  const { touch } = useResponsive();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const resolvedMode =
    mode === "system" ? (document.documentElement.getAttribute("data-mode") ?? "light") : mode;
  const isDark = resolvedMode === "dark";
  const isTouchDevice = mobile || touch;

  const handleToggleTheme = () => {
    setMode(isDark ? "light" : "dark");
  };

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [exportOpen]);

  // Shared icon-button base styles
  const iconBtn = cn(
    "inline-flex items-center justify-center rounded-md p-2",
    "text-foreground-muted transition-colors",
    "hover:bg-surface hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
    isTouchDevice && "active:scale-95"
  );

  return (
    <header
      className={cn(
        "flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur-sm",
        mobile ? "px-3" : "px-4",
        "h-12"
      )}
      style={{
        paddingTop: mobile ? "var(--safe-area-inset-top, 0px)" : undefined
      }}
    >
      {/* Left: sidebar toggle + app name */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={iconBtn}
          style={{ minHeight: 36, minWidth: 36 }}
          aria-label={mobile ? t("sidebar_open") : t("sidebar_toggle")}
        >
          <ListIcon size={18} />
        </button>

        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold text-foreground">{t("app_title")}</span>
          {!mobile && (
            <span className="mt-0.5 text-[11px] text-foreground-muted">{t("app_subtitle")}</span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className={cn("flex items-center", mobile ? "gap-0.5" : "gap-1")}>
        {/* New chat */}
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            iconBtn,
            "gap-1.5 px-2.5 text-xs font-medium",
            "border border-border"
          )}
          style={{ minHeight: 36, minWidth: 36 }}
          aria-label={t("session_new")}
          title={t("session_new")}
        >
          <PlusIcon size={16} />
          <span className="hidden sm:inline">{t("session_new")}</span>
        </button>

        {/* Export dropdown */}
        <div ref={exportRef} className="relative">
          <button
            type="button"
            disabled={disableExportAll}
            onClick={() => setExportOpen((prev) => !prev)}
            className={cn(
              iconBtn,
              "gap-0.5",
              disableExportAll && "cursor-not-allowed opacity-40"
            )}
            style={{ minHeight: 36, minWidth: 36 }}
            aria-label={t("topbar_export_options")}
            title={t("topbar_export_options")}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <DownloadSimpleIcon size={17} />
            <CaretDownIcon
              size={12}
              className={cn("transition-transform", exportOpen && "rotate-180")}
            />
          </button>

          {exportOpen && (
            <div
              role="menu"
              className={cn(
                "absolute right-0 top-full z-50 mt-1.5",
                "w-44 rounded-lg border border-border bg-surface shadow-lg",
                "py-1"
              )}
            >
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none"
                onClick={() => {
                  onExportMarkdown();
                  setExportOpen(false);
                }}
              >
                {t("topbar_export_markdown")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none"
                onClick={() => {
                  onExportPdf();
                  setExportOpen(false);
                }}
              >
                {t("topbar_export_pdf")}
              </button>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={handleToggleTheme}
          className={iconBtn}
          style={{ minHeight: 36, minWidth: 36 }}
          aria-label={t("theme_toggle")}
          title={t("theme_toggle")}
        >
          {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </button>

        {/* User menu */}
        <UserMenu t={t} isTouchDevice={isTouchDevice} />

        {/* Connection indicator — desktop only */}
        {!mobile && (
          <div className="ml-1 hidden items-center sm:flex">
            <ConnectionIndicator
              status={connectionStatus}
              labels={{
                connecting: t("connection_connecting"),
                connected: t("connection_connected"),
                disconnected: t("connection_disconnected")
              }}
            />
          </div>
        )}
      </div>
    </header>
  );
}
