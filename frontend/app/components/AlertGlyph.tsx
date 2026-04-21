import React from "react";

type Props = { size?: number; className?: string; color?: string };

/**
 * Equilateral triangle with a centred exclamation mark. Inherits stroke colour
 * from `currentColor` so a parent card (e.g. `.redflags-card`) can drive it via
 * `color: var(--danger)`. Stylistically matches {@link LeafGlyph}: thin stroke,
 * no fill, inline-block for inline use alongside text.
 */
export function AlertGlyph({ size = 16, className, color = "currentColor" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      style={{ display: "inline-block" }}
    >
      {/* Triangle — apex at top, baseline across the bottom. */}
      <path
        d="M 12 3 L 22 20 L 2 20 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Exclamation stem. */}
      <path
        d="M 12 10 L 12 15"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* Exclamation dot. */}
      <circle cx={12} cy={17.5} r={0.9} fill={color} />
    </svg>
  );
}
