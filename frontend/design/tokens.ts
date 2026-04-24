export const colors = {
  obsidian: "#0A0F1A",
  inkWell: "#0E1424",
  inkRim: "#1A2133",
  fog: "#E9EEF5",
  fogDim: "#93A0B5",
  cyan: "#22E1D7",
  cyanSoft: "rgba(34,225,215,0.15)",
  coral: "#FF7759",
  lime: "#B8FF5C",
  amber: "#F7B23B",
  crimson: "#FF4D5E",
  mica: "#2A3346",
  primary: "#22E1D7",
  success: "#B8FF5C",
  warning: "#F7B23B",
  danger: "#FF4D5E",
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
  card: "inset 0 1px 0 rgba(255,255,255,0.04)",
  elevated: "0 0 18px rgba(34,225,215,0.12)",
  glowCyan: "0 0 18px rgba(34,225,215,0.4)",
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
