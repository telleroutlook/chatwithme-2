import { Component, type ReactNode, type ErrorInfo } from "react";
import { WarningIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: "app" | "message" | "chart";
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for graceful error handling
 *
 * Levels:
 * - app: Full application crash - shows full page error
 * - message: Message render error - shows inline error with retry
 * - chart: Chart parse error - shows minimal error card
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const level = this.props.level ?? "message";

      if (level === "app") {
        return (
          <div className="flex h-screen w-screen items-center justify-center bg-surface p-4">
            <div className="rounded-xl border border-border bg-surface-elevated w-full max-w-md rounded-xl p-6 text-center ring ring-border">
              <WarningIcon size={48} className="mx-auto mb-4 text-[var(--app-color-danger)]" weight="thin" />
              <div className="mb-2">
                <p className="text-lg font-bold text-foreground">
                  Something went wrong
                </p>
              </div>
              <div className="mb-4">
                <p className="text-sm text-foreground-muted">
                  {this.state.error?.message ?? "An unexpected error occurred"}
                </p>
              </div>
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm h-8 px-3 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowClockwiseIcon size={16} className="mr-2" />
                Reload
              </button>
            </div>
          </div>
        );
      }

      if (level === "chart") {
        return (
          <div role="alert" className="rounded-xl border border-border bg-surface-elevated rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
            <div className="flex items-center gap-2">
              <WarningIcon size={14} className="app-text-danger" />
              <span className="text-xs app-text-danger">Render error</span>
            </div>
          </div>
        );
      }

      // message level
      return (
        <div role="alert" className="rounded-xl border border-border bg-surface-elevated rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <WarningIcon size={16} className="mt-0.5 app-text-danger" weight="fill" />
              <div>
                <span className="text-sm app-text-danger">Failed to render content</span>
                <div className="mt-1">
                  <span className="text-xs text-foreground-muted">
                    {this.state.error?.message ?? "Unknown error"}
                  </span>
                </div>
              </div>
            </div>
            {this.props.onRetry && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors border border-border bg-surface-elevated hover:bg-muted text-foreground h-6 px-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowClockwiseIcon size={12} className="mr-1" />
                Retry
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrapper for chart-specific error boundaries
 */
export function ChartErrorBoundary({ children }: { children: ReactNode }): ReactNode {
  return (
    <ErrorBoundary level="chart">
      {children}
    </ErrorBoundary>
  );
}

/**
 * Wrapper for message-specific error boundaries
 */
export function MessageErrorBoundary({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}): ReactNode {
  return (
    <ErrorBoundary level="message" onRetry={onRetry}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * HOC for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  boundaryProps?: Omit<ErrorBoundaryProps, "children">
): React.FC<P> {
  return function WithErrorBoundaryWrapper(props: P): ReactNode {
    return (
      <ErrorBoundary {...boundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
