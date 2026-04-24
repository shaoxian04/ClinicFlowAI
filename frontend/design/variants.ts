import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-sans transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-oxblood text-paper hover:bg-oxblood/90",
        secondary: "border border-hairline bg-paper text-ink hover:bg-bone",
        ghost: "text-ink-soft hover:bg-bone/50",
        destructive: "bg-crimson text-paper hover:bg-crimson/90",
        link: "text-oxblood underline-offset-4 hover:underline",
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
      paper: "bg-paper border border-hairline",
      slate: "bg-slate text-paper border border-slate",
      bone: "bg-bone border border-hairline",
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
        neutral: "bg-bone text-ink-soft",
        primary: "bg-oxblood/10 text-oxblood",
        good: "bg-sage/10 text-sage",
        warn: "bg-ochre/10 text-ochre",
        danger: "bg-crimson/10 text-crimson",
        draft: "bg-oxblood/10 text-oxblood border-l-2 border-oxblood",
        review: "bg-ochre/10 text-ochre",
        published: "bg-sage/10 text-sage",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export const inputVariants = cva(
  "h-10 w-full rounded-sm border border-hairline bg-paper px-3 text-sm font-sans text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-1 focus:ring-oxblood/40 disabled:opacity-50"
);

export const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-sm font-sans transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-oxblood text-paper hover:bg-oxblood/90",
        secondary: "border border-hairline bg-paper text-ink hover:bg-bone",
        ghost: "text-ink-soft hover:bg-bone/50",
        destructive: "bg-crimson text-paper hover:bg-crimson/90",
        link: "text-oxblood underline-offset-4 hover:underline",
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
