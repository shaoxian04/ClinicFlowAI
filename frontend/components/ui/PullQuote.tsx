import * as React from "react";
import { cn } from "@/design/cn";

export interface PullQuoteProps extends React.BlockquoteHTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function PullQuote({ children, className, ...props }: PullQuoteProps) {
  return (
    <blockquote
      className={cn(
        "font-display text-xl leading-relaxed text-ink border-l-2 border-oxblood pl-6 my-6",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  );
}
