import * as React from "react";
import { cn } from "@/design/cn";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: string;
}

export function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded-xs border border-ink-rim bg-mica px-1.5 py-0.5 text-xs font-mono text-fog-dim",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
