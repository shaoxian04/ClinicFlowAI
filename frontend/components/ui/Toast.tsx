"use client";

import * as React from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/design/cn";
import type { ToastVariant } from "./useToast";

export const ToastProvider = RadixToast.Provider;
export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof RadixToast.Viewport>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Viewport>
>(({ className, ...props }, ref) => (
  <RadixToast.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = RadixToast.Viewport.displayName;

const variantStyles: Record<ToastVariant, string> = {
  success: "border-l-2 border-sage",
  error: "border-l-2 border-crimson",
  info: "border-l-2 border-oxblood",
};

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof RadixToast.Root> {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export const Toast = React.forwardRef<
  React.ElementRef<typeof RadixToast.Root>,
  ToastProps
>(({ className, title, description, variant = "info", ...props }, ref) => (
  <RadixToast.Root
    ref={ref}
    className={cn(
      "relative flex flex-col gap-1 bg-paper border border-hairline rounded-sm p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
      variantStyles[variant],
      className
    )}
    {...props}
  >
    <RadixToast.Title className="text-sm font-medium font-sans text-ink">
      {title}
    </RadixToast.Title>
    {description ? (
      <RadixToast.Description className="text-xs font-sans text-ink-soft">
        {description}
      </RadixToast.Description>
    ) : null}
    <RadixToast.Close className="absolute right-2 top-2 text-ink-soft hover:text-ink transition-colors duration-150">
      <X className="h-3.5 w-3.5" />
      <span className="sr-only">Close</span>
    </RadixToast.Close>
  </RadixToast.Root>
));
Toast.displayName = "Toast";
