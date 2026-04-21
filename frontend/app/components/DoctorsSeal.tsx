import React from "react";

type Props = {
  size?: number;
  doctorName?: string;
  date?: string;
  visitId?: string;
  rotate?: number;
  className?: string;
};

export function DoctorsSeal({
  size = 160,
  doctorName = "Dr. Nadia Rahim",
  date = "MMXXVI · APR · XXIV",
  visitId,
  rotate = -6,
  className,
}: Props) {
  const outer = size / 2 - 2;
  const ring = size / 2 - 10;
  const textRadius = size / 2 - 20;
  const topText = `CONFIRMED · ${doctorName.toUpperCase()}`;
  const bottomText = visitId
    ? `${date} · VISIT ${visitId.slice(0, 6).toUpperCase()}`
    : date;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ transform: `rotate(${rotate}deg)`, filter: "drop-shadow(0 18px 24px rgba(30, 28, 22, 0.18))" }}
      role="img"
      aria-label={`Seal: confirmed by ${doctorName}`}
    >
      <defs>
        <path
          id={`seal-top-${size}`}
          d={`M ${size / 2 - textRadius} ${size / 2} a ${textRadius} ${textRadius} 0 0 1 ${textRadius * 2} 0`}
        />
        <path
          id={`seal-bottom-${size}`}
          d={`M ${size / 2 - textRadius} ${size / 2} a ${textRadius} ${textRadius} 0 0 0 ${textRadius * 2} 0`}
        />
        <radialGradient id={`seal-fill-${size}`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#245d50" />
          <stop offset="100%" stopColor="#153a32" />
        </radialGradient>
      </defs>

      <circle cx={size / 2} cy={size / 2} r={outer} fill={`url(#seal-fill-${size})`} />
      <circle cx={size / 2} cy={size / 2} r={outer} fill="none" stroke="#b8573b" strokeWidth={2.5} opacity={0.92} />
      <circle cx={size / 2} cy={size / 2} r={ring} fill="none" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.55} />

      <text
        fill="#f6f1e7"
        style={{ fontFamily: "var(--font-body), sans-serif", fontSize: size * 0.058, letterSpacing: "0.14em", fontWeight: 600 }}
      >
        <textPath href={`#seal-top-${size}`} startOffset="50%" textAnchor="middle">
          {topText}
        </textPath>
      </text>
      <text
        fill="#f6f1e7"
        style={{ fontFamily: "var(--font-body), sans-serif", fontSize: size * 0.05, letterSpacing: "0.18em", fontWeight: 500 }}
        opacity={0.75}
      >
        <textPath href={`#seal-bottom-${size}`} startOffset="50%" textAnchor="middle">
          {bottomText}
        </textPath>
      </text>

      {/* Apothecary leaf glyph (centered) */}
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <path
          d="M 0 -22 C 14 -14, 14 10, 0 22 C -14 10, -14 -14, 0 -22 Z"
          fill="none"
          stroke="#f6f1e7"
          strokeWidth={1.6}
          opacity={0.9}
        />
        <path d="M 0 -18 L 0 18" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.7} />
        <path d="M 0 -10 L 7 -4" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.7} />
        <path d="M 0 -10 L -7 -4" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.7} />
        <path d="M 0 2 L 6 8" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.7} />
        <path d="M 0 2 L -6 8" stroke="#f6f1e7" strokeWidth={0.9} opacity={0.7} />
        <circle cx={0} cy={0} r={2.2} fill="#b8573b" />
      </g>
    </svg>
  );
}
