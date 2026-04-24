import * as React from "react";
import { Card } from "./Card";
import { cn } from "@/design/cn";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

export function StatTile({ label, value, icon, className, ...props }: StatTileProps) {
  return (
    <Card variant="bone" className={cn("flex flex-col gap-1", className)} {...props}>
      {icon ? (
        <div className="text-ink-soft mb-1">{icon}</div>
      ) : null}
      <div className="font-display text-2xl text-ink">{value}</div>
      <div className="text-xs text-ink-soft uppercase tracking-wider mt-1">
        {label}
      </div>
    </Card>
  );
}
