import React from "react";

export function LeafGlyph({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "inline-block" }}>
      <path
        d="M 12 2 C 20 6, 20 18, 12 22 C 4 18, 4 6, 12 2 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
      />
      <path d="M 12 4 L 12 20" stroke={color} strokeWidth={1} opacity={0.7} />
      <path d="M 12 9 L 16 7" stroke={color} strokeWidth={1} opacity={0.7} />
      <path d="M 12 9 L 8 7" stroke={color} strokeWidth={1} opacity={0.7} />
      <path d="M 12 14 L 16 12" stroke={color} strokeWidth={1} opacity={0.7} />
      <path d="M 12 14 L 8 12" stroke={color} strokeWidth={1} opacity={0.7} />
    </svg>
  );
}
