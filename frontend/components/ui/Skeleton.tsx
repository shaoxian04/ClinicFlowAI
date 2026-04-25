import * as React from "react";
import { cn } from "@/design/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse bg-mica/60 rounded-xs", className)}
      {...props}
    />
  );
}
