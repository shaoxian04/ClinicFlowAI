"use client";

export type DonutSlice = { label: string; value: number; color: string };

type Props = {
    slices: DonutSlice[];
    size?: number;
    strokeWidth?: number;
    className?: string;
    /** Background ring color (the "empty" track). */
    trackColor?: string;
};

/**
 * Pure-SVG donut. Slices render in supplied order, starting at 12 o'clock,
 * walking clockwise. Total of {@code value}s defines the full circle.
 */
export function DonutChart({
    slices,
    size = 100,
    strokeWidth = 14,
    className,
    trackColor = "#1a2238",
}: Props) {
    const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const arcs = slices.map((s) => {
        const len = total === 0 ? 0 : (s.value / total) * circumference;
        const arc = {
            color: s.color,
            dasharray: `${len.toFixed(2)} ${(circumference - len).toFixed(2)}`,
            dashoffset: -offset,
        };
        offset += len;
        return arc;
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
            {arcs.map((a, i) => (
                <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={a.dasharray}
                    strokeDashoffset={a.dashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            ))}
        </svg>
    );
}
