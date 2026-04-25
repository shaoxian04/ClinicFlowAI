"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/design/cn";

export const Tabs = RadixTabs.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={cn("flex gap-0 border-b border-ink-rim", className)}
    {...props}
  />
));
TabsList.displayName = RadixTabs.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn(
      "px-4 py-2 text-sm font-sans text-fog-dim transition-colors duration-150 data-[state=active]:text-cyan data-[state=active]:border-b-2 data-[state=active]:border-cyan focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan/40",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = RadixTabs.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={cn("pt-4 focus:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = RadixTabs.Content.displayName;
