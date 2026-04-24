export const colors = {
  paper: "#F6F1E6",
  bone: "#E8DFCE",
  ink: "#141414",
  inkSoft: "#3B3A35",
  oxblood: "#7A2E2E",
  sage: "#4F6B56",
  ochre: "#B87C2A",
  crimson: "#8F1C1C",
  slate: "#1F2A2B",
  hairline: "#D9D1BE",
  primary: "#7A2E2E",
  success: "#4F6B56",
  warning: "#B87C2A",
  danger: "#8F1C1C",
} as const;

export const fonts = {
  display: "var(--font-display)",
  body: "var(--font-body)",
  mono: "var(--font-mono)",
} as const;

export const radii = {
  xs: "2px",
  sm: "4px",
  md: "8px",
} as const;

export const shadows = {
  card: "0 1px 3px rgba(0,0,0,0.06)",
  elevated: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

export const spacing = {
  section: "3rem",
  content: "1.5rem",
  tight: "0.75rem",
} as const;

export const motion = {
  duration: {
    fast: 0.15,
    normal: 0.3,
    slow: 0.5,
  },
  easing: {
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  },
} as const;
