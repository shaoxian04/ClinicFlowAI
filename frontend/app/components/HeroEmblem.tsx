import React from "react";

type Props = {
  size?: number;
  className?: string;
};

export function HeroEmblem({ size = 320, className }: Props) {
  const c = size / 2;
  const r1 = size * 0.46;
  const r2 = size * 0.34;
  const r3 = size * 0.22;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ filter: "drop-shadow(0 22px 32px rgba(30, 28, 22, 0.12))" }}
      role="img"
      aria-label="CliniFlow — three phases of a visit"
    >
      <defs>
        <radialGradient id="hero-disc" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#2a6a5c" />
          <stop offset="60%" stopColor="#1d4d42" />
          <stop offset="100%" stopColor="#123229" />
        </radialGradient>
        <linearGradient id="hero-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b8573b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#b8573b" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <circle cx={c} cy={c} r={r1} fill="url(#hero-disc)" />
      <circle cx={c} cy={c} r={r1} fill="none" stroke="url(#hero-ring)" strokeWidth={2.5} />
      <circle cx={c} cy={c} r={r2} fill="none" stroke="#f6f1e7" strokeWidth={0.8} opacity={0.35} strokeDasharray="2 6" />
      <circle cx={c} cy={c} r={r3} fill="none" stroke="#f6f1e7" strokeWidth={0.8} opacity={0.5} />

      {/* 3 orbiting dots = 3 phases */}
      <g>
        <circle cx={c} cy={c - r2} r={6} fill="#f6f1e7" />
        <circle cx={c + r2 * 0.866} cy={c + r2 * 0.5} r={6} fill="#f6f1e7" opacity={0.85} />
        <circle cx={c - r2 * 0.866} cy={c + r2 * 0.5} r={6} fill="#b8573b" />
      </g>

      {/* Center apothecary leaf */}
      <g transform={`translate(${c}, ${c})`}>
        <path
          d={`M 0 ${-r3 * 0.9} C ${r3 * 0.55} ${-r3 * 0.55}, ${r3 * 0.55} ${r3 * 0.4}, 0 ${r3 * 0.9} C ${-r3 * 0.55} ${r3 * 0.4}, ${-r3 * 0.55} ${-r3 * 0.55}, 0 ${-r3 * 0.9} Z`}
          fill="none"
          stroke="#f6f1e7"
          strokeWidth={1.6}
          opacity={0.95}
        />
        <path d={`M 0 ${-r3 * 0.75} L 0 ${r3 * 0.75}`} stroke="#f6f1e7" strokeWidth={0.9} opacity={0.6} />
        <path d={`M 0 ${-r3 * 0.4} L ${r3 * 0.3} ${-r3 * 0.15}`} stroke="#f6f1e7" strokeWidth={0.9} opacity={0.6} />
        <path d={`M 0 ${-r3 * 0.4} L ${-r3 * 0.3} ${-r3 * 0.15}`} stroke="#f6f1e7" strokeWidth={0.9} opacity={0.6} />
        <path d={`M 0 ${r3 * 0.1} L ${r3 * 0.28} ${r3 * 0.35}`} stroke="#f6f1e7" strokeWidth={0.9} opacity={0.6} />
        <path d={`M 0 ${r3 * 0.1} L ${-r3 * 0.28} ${r3 * 0.35}`} stroke="#f6f1e7" strokeWidth={0.9} opacity={0.6} />
        <circle cx={0} cy={0} r={2.4} fill="#b8573b" />
      </g>
    </svg>
  );
}
