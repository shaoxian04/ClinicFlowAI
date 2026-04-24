import * as React from "react";
import { cn } from "@/design/cn";

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  number?: string;
  title: string;
  action?: React.ReactNode;
}

export function SectionHeader({
  number,
  title,
  action,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn("flex items-center gap-3", className)}
      {...props}
    >
      {number ? (
        <span className="font-mono text-xs text-ink-soft/60 tracking-widest flex-shrink-0">
          {number}
        </span>
      ) : null}
      {number ? (
        <span className="text-hairline select-none flex-shrink-0">---</span>
      ) : null}
      <span className="text-sm font-medium uppercase tracking-wider text-ink flex-1">
        {title}
      </span>
      {action ? <div className="ml-auto flex-shrink-0">{action}</div> : null}
    </div>
  );
}
