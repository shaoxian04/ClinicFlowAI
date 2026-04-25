import * as React from "react";
import { cn } from "@/design/cn";

export interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  if (orientation === "vertical") {
    return (
      <div
        className={cn("w-px bg-ink-rim self-stretch", className)}
        role="separator"
        aria-orientation="vertical"
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      />
    );
  }
  return (
    <hr
      className={cn("border-t border-ink-rim my-4", className)}
      {...props}
    />
  );
}
