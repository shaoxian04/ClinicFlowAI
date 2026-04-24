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
        obsidian: "#0A0F1A",
        "ink-well": "#0E1424",
        "ink-rim": "#1A2133",
        fog: "#E9EEF5",
        "fog-dim": "#93A0B5",
        cyan: "#22E1D7",
        "cyan-soft": "rgba(34,225,215,0.15)",
        coral: "#FF7759",
        lime: "#B8FF5C",
        amber: "#F7B23B",
        crimson: "#FF4D5E",
        mica: "#2A3346",
        primary: "#22E1D7",
        success: "#B8FF5C",
        warning: "#F7B23B",
        danger: "#FF4D5E",
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
      boxShadow: {
        "glow-cyan": "0 0 18px rgba(34,225,215,0.4)",
        card: "inset 0 1px 0 rgba(255,255,255,0.04)",
        elevated: "0 0 18px rgba(34,225,215,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
