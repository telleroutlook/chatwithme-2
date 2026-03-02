import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button, Text, Surface } from "@cloudflare/kumo";
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
          <div className="flex h-screen w-screen items-center justify-center bg-kumo-base p-4">
            <Surface className="w-full max-w-md rounded-xl p-6 text-center ring ring-kumo-line">
              <WarningIcon size={48} className="mx-auto mb-4 text-kumo-critical" weight="thin" />
              <div className="mb-2">
                <Text size="lg" bold>
                  Something went wrong
                </Text>
              </div>
              <div className="mb-4">
                <Text size="sm" variant="secondary">
                  {this.state.error?.message ?? "An unexpected error occurred"}
                </Text>
              </div>
              <Button variant="primary" onClick={this.handleRetry}>
                <ArrowClockwiseIcon size={16} className="mr-2" />
                Reload
              </Button>
            </Surface>
          </div>
        );
      }

      if (level === "chart") {
        return (
          <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
            <div className="flex items-center gap-2">
              <WarningIcon size={14} className="app-text-danger" />
              <Text size="xs">
                <span className="app-text-danger">Render error</span>
              </Text>
            </div>
          </Surface>
        );
      }

      // message level
      return (
        <Surface className="rounded-lg border app-border-danger-soft app-bg-danger-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <WarningIcon size={16} className="mt-0.5 app-text-danger" weight="fill" />
              <div>
                <Text size="sm">
                  <span className="app-text-danger">Failed to render content</span>
                </Text>
                <div className="mt-1">
                  <Text size="xs" variant="secondary">
                    {this.state.error?.message ?? "Unknown error"}
                  </Text>
                </div>
              </div>
            </div>
            {this.props.onRetry && (
              <Button size="xs" variant="secondary" onClick={this.handleRetry}>
                <ArrowClockwiseIcon size={12} className="mr-1" />
                Retry
              </Button>
            )}
          </div>
        </Surface>
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
