import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

interface PrimitiveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function PrimitiveButton({
  variant = "secondary",
  size = "sm",
  className,
  icon,
  children,
  ...props
}: PrimitiveButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "primary" &&
          "border-transparent bg-[var(--app-accent)] text-[var(--app-text-on-accent)] hover:brightness-110",
        variant === "secondary" &&
          "border-[var(--app-border-default)] bg-[var(--app-surface-secondary)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-tertiary)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-surface-secondary)] hover:text-[var(--app-text-primary)]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
