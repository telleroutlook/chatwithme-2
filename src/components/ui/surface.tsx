import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Surface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border border-border bg-surface-elevated", className)}
      {...props}
    />
  )
);
Surface.displayName = "Surface";

export { Surface };
