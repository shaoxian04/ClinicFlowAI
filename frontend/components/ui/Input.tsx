"use client";

import * as React from "react";
import { cn } from "@/design/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          "h-10 w-full rounded-sm border border-hairline bg-paper px-3 text-sm font-sans text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-1 focus:ring-oxblood/40 disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
