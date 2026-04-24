import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/design/cn";
import { cardVariants } from "@/design/variants";

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, action, className }: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 mb-4", className)}
    >
      <div className="font-sans font-medium text-sm text-ink-soft uppercase tracking-wider">
        {title}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
