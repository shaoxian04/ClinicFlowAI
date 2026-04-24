import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/design/cn";
import { badgeVariants } from "@/design/variants";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
