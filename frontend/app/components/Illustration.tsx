import React from "react";

/**
 * Stroke-only SVG illustration glyphs, matching the LeafGlyph aesthetic.
 * All strokes use currentColor so they inherit from the parent's CSS color.
 * 24x24 viewBox, strokeWidth 1.5 default, no fills (fill="none" on paths).
 */

type GlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const baseProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  "aria-hidden": true as const,
  style: { display: "inline-block" as const },
});

const strokeDefaults = (color: string, strokeWidth: number) => ({
  fill: "none",
  stroke: color,
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function Stethoscope({ size = 48, color = "currentColor", strokeWidth = 1.5 }: GlyphProps) {
  const s = strokeDefaults(color, strokeWidth);
  return (
    <svg {...baseProps(size)}>
      {/* Earpiece tubes branching down to a Y */}
      <path d="M 7 3 L 7 9 C 7 13, 11 15, 12 15 C 13 15, 17 13, 17 9 L 17 3" {...s} />
      {/* Tube from junction to chest-piece */}
      <path d="M 12 15 L 12 18" {...s} />
      {/* Chest-piece bell */}
      <circle cx="12" cy="20" r="2.2" {...s} />
      {/* Earpiece tips */}
      <circle cx="7" cy="3" r="0.9" {...s} />
      <circle cx="17" cy="3" r="0.9" {...s} />
    </svg>
  );
}

export function PillBottle({ size = 48, color = "currentColor", strokeWidth = 1.5 }: GlyphProps) {
  const s = strokeDefaults(color, strokeWidth);
  return (
    <svg {...baseProps(size)}>
      {/* Cap */}
      <path d="M 7 4 L 17 4 L 17 7 L 7 7 Z" {...s} />
      {/* Bottle body */}
      <path d="M 6.5 7 L 17.5 7 L 17.5 20 C 17.5 20.6, 17 21, 16.5 21 L 7.5 21 C 7 21, 6.5 20.6, 6.5 20 Z" {...s} />
      {/* Plus label on body */}
      <path d="M 12 11 L 12 16" {...s} opacity={0.7} />
      <path d="M 9.5 13.5 L 14.5 13.5" {...s} opacity={0.7} />
    </svg>
  );
}

export function Envelope({ size = 48, color = "currentColor", strokeWidth = 1.5 }: GlyphProps) {
  const s = strokeDefaults(color, strokeWidth);
  return (
    <svg {...baseProps(size)}>
      {/* Envelope outer */}
      <path d="M 3.5 6 L 20.5 6 C 20.8 6, 21 6.2, 21 6.5 L 21 17.5 C 21 17.8, 20.8 18, 20.5 18 L 3.5 18 C 3.2 18, 3 17.8, 3 17.5 L 3 6.5 C 3 6.2, 3.2 6, 3.5 6 Z" {...s} />
      {/* Flap crease */}
      <path d="M 3 6.5 L 12 13 L 21 6.5" {...s} />
      {/* Side folds (faint) */}
      <path d="M 3 17.5 L 9.5 11.5" {...s} opacity={0.6} />
      <path d="M 21 17.5 L 14.5 11.5" {...s} opacity={0.6} />
    </svg>
  );
}

export function LeafPair({ size = 48, color = "currentColor", strokeWidth = 1.5 }: GlyphProps) {
  const s = strokeDefaults(color, strokeWidth);
  return (
    <svg {...baseProps(size)}>
      {/* Left leaf */}
      <path d="M 11 4 C 5 7, 5 15, 11 20 C 12 15, 12 9, 11 4 Z" {...s} />
      {/* Right leaf */}
      <path d="M 13 4 C 19 7, 19 15, 13 20 C 12 15, 12 9, 13 4 Z" {...s} />
      {/* Stem */}
      <path d="M 12 20 L 12 22" {...s} opacity={0.7} />
    </svg>
  );
}

export function Waveform({ size = 48, color = "currentColor", strokeWidth = 1.5 }: GlyphProps) {
  const s = strokeDefaults(color, strokeWidth);
  return (
    <svg {...baseProps(size)}>
      {/* Baseline */}
      <path d="M 2 12 L 6 12" {...s} opacity={0.5} />
      <path d="M 18 12 L 22 12" {...s} opacity={0.5} />
      {/* Pulse peak */}
      <path d="M 6 12 L 8 12 L 9.5 7 L 11.5 17 L 13.5 5 L 15.5 15 L 17 12 L 18 12" {...s} />
    </svg>
  );
}
