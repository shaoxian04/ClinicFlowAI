import * as React from "react";
import { cn } from "@/design/cn";

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn("text-sm font-medium text-ink-soft font-sans", className)}
      {...props}
    />
  );
}
