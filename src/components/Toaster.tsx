import type { CSSProperties } from "react";
import { useToast } from "../hooks/useToast";
import type { Toast } from "../hooks/useToast";
import { useI18n } from "../hooks/useI18n";

export function Toaster() {
  const { toasts, removeToast } = useToast();
  const { t } = useI18n();

  if (toasts.length === 0) return null;

  const maxVisibleToasts = 4;
  const hiddenCount = Math.max(0, toasts.length - maxVisibleToasts);
  const visibleToasts = toasts.slice(-maxVisibleToasts);

  const typeVars: Record<Toast["type"], CSSProperties> = {
    success: {
      "--toast-bg": "var(--color-toast-success-bg, #166534)",
      "--toast-fg": "var(--color-toast-success-fg, #f0fdf4)",
      "--toast-border": "var(--color-toast-success-border, #22c55e)"
    } as CSSProperties,
    error: {
      "--toast-bg": "var(--color-toast-error-bg, #7f1d1d)",
      "--toast-fg": "var(--color-toast-error-fg, #fef2f2)",
      "--toast-border": "var(--color-toast-error-border, #ef4444)"
    } as CSSProperties,
    info: {
      "--toast-bg": "var(--color-toast-info-bg, var(--color-kumo-inverse, #111827))",
      "--toast-fg": "var(--color-toast-info-fg, var(--color-kumo-base, #f9fafb))",
      "--toast-border": "var(--color-toast-info-border, #4b5563)"
    } as CSSProperties
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-[420px]"
      role="region"
      aria-label={t("toaster_region_label")}
    >
      {hiddenCount > 0 && (
        <div className="text-xs text-kumo-subtle px-2 py-1 text-right">
          {t("toaster_hidden_count", { count: String(hiddenCount) })}
        </div>
      )}
      {visibleToasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`
            toast app-glass flex items-start gap-3 px-4 py-3 rounded-xl shadow-[var(--app-shadow-medium)] min-h-12
            animate-slide-in border bg-[var(--toast-bg)] text-[var(--toast-fg)] border-[var(--toast-border)]
            ${toast.type === "success" ? "toast-success" : ""}
            ${toast.type === "error" ? "toast-error" : ""}
            ${toast.type === "info" ? "toast-info" : ""}
          `}
          style={typeVars[toast.type]}
        >
          <span className="flex-1 text-sm leading-5">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md opacity-80 hover:opacity-100 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current transition"
            aria-label={t("toaster_close")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
