import * as React from "react";
import { Label } from "./Label";
import { cn } from "@/design/cn";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  ...props
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {hint && !error ? (
        <p className="text-xs text-ink-soft/70 font-sans">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-crimson font-sans">{error}</p>
      ) : null}
    </div>
  );
}
