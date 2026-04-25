"use client";

import * as React from "react";
import { cn } from "@/design/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "min-h-[80px] w-full resize-y rounded-sm border border-ink-rim bg-ink-well px-3 py-2 text-sm font-sans text-fog placeholder:text-fog-dim/50 focus:outline-none focus:ring-1 focus:ring-cyan/40 disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
