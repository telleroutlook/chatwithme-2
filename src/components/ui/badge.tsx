import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-accent/15 text-accent",
        secondary: "bg-muted text-foreground-muted",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        outline: "border border-border text-foreground-muted",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
