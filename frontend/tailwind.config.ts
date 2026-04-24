import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./design/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F6F1E6",
        bone: "#E8DFCE",
        ink: "#141414",
        "ink-soft": "#3B3A35",
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
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xs: "2px",
        sm: "4px",
        md: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
