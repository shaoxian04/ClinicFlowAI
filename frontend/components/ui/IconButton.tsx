"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/design/cn";
import { iconButtonVariants } from "@/design/variants";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  icon: React.ReactNode;
  "aria-label": string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, icon, ...props }, ref) => {
    return (
      <button
        className={cn(iconButtonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
