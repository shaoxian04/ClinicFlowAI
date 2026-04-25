import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-sans transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-cyan text-obsidian hover:bg-cyan/90",
        secondary: "border border-ink-rim bg-ink-well text-fog hover:bg-mica",
        ghost: "text-fog-dim hover:bg-ink-well",
        destructive: "bg-crimson text-fog hover:bg-crimson/90",
        link: "text-cyan underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export const cardVariants = cva("rounded-sm p-6", {
  variants: {
    variant: {
      paper: "bg-ink-well border border-ink-rim shadow-card",
      slate: "bg-obsidian text-fog border border-ink-rim",
      bone: "bg-mica border border-ink-rim",
      glass:
        "bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass",
      glow: "bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass shadow-glow-aurora",
    },
  },
  defaultVariants: {
    variant: "paper",
  },
});

export const badgeVariants = cva(
  "inline-flex items-center rounded-xs px-2 py-0.5 text-xs font-medium font-sans uppercase tracking-wider",
  {
    variants: {
      variant: {
        neutral: "bg-mica text-fog-dim",
        primary: "bg-cyan/10 text-cyan",
        good: "bg-lime/10 text-lime",
        warn: "bg-amber/10 text-amber",
        danger: "bg-crimson/10 text-crimson",
        draft: "bg-coral/10 text-coral border-l-2 border-coral",
        review: "bg-amber/10 text-amber",
        published: "bg-lime/10 text-lime",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export const inputVariants = cva(
  "h-10 w-full rounded-sm border border-ink-rim bg-ink-well px-3 text-sm font-sans text-fog placeholder:text-fog-dim/50 focus:outline-none focus:ring-1 focus:ring-cyan/40 disabled:opacity-50"
);

export const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-sm font-sans transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-cyan text-obsidian hover:bg-cyan/90",
        secondary: "border border-ink-rim bg-ink-well text-fog hover:bg-mica",
        ghost: "text-fog-dim hover:bg-ink-well",
        destructive: "bg-crimson text-fog hover:bg-crimson/90",
        link: "text-cyan underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  }
);
