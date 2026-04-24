"use client";

import * as React from "react";
import { cn } from "@/design/cn";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "paper" | "slate";
  children: React.ReactNode;
}

export function AppShell({
  variant = "paper",
  children,
  className,
  ...props
}: AppShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen font-sans",
        variant === "paper" ? "bg-obsidian text-fog" : "bg-ink-well text-fog",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
