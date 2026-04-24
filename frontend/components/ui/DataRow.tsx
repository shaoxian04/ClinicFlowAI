import * as React from "react";
import { cn } from "@/design/cn";

export interface DataRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
}

export function DataRow({ label, value, mono = false, className, ...props }: DataRowProps) {
  return (
    <div
      className={cn("flex items-baseline justify-between gap-4", className)}
      {...props}
    >
      <span className="text-sm text-fog-dim font-sans flex-shrink-0">{label}</span>
      <span
        className={cn(
          "text-sm text-fog text-right",
          mono ? "font-mono" : "font-sans"
        )}
      >
        {value}
      </span>
    </div>
  );
}
