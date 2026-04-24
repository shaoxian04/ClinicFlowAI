import * as React from "react";
import { cn } from "@/design/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-3 py-12 px-6",
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="text-ink-soft/40 [&>svg]:w-10 [&>svg]:h-10">{icon}</div>
      ) : null}
      <p className="font-sans text-base text-ink">{title}</p>
      {description ? (
        <p className="text-sm text-ink-soft max-w-[42ch]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
