"use client";

type Point = { x: number; y: number; label?: string };

type Props = {
    points: Point[];
    width?: number;
    height?: number;
    /** "obsidian" stroke + faint cyan fill is the default. */
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    className?: string;
};

/**
 * Pure-SVG area chart. Pass normalised points (x,y in any range — auto-fit).
 * Designed for hero KPI strips; no axes, no labels — those go in the parent.
 */
export function AreaChart({
    points,
    width = 200,
    height = 60,
    stroke = "#2dd4bf",
    fill = "rgba(45,212,191,0.18)",
    strokeWidth = 1.6,
    className,
}: Props) {
    if (points.length === 0) {
        return <svg width={width} height={height} className={className} aria-hidden="true" />;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 4;
    const sx = (x: number) => pad + ((x - minX) / rangeX) * (width - 2 * pad);
    const sy = (y: number) => height - pad - ((y - minY) / rangeY) * (height - 2 * pad);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${sx(maxX).toFixed(1)},${height} L${sx(minX).toFixed(1)},${height} Z`;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
            <path d={areaPath} fill={fill} />
            <path d={linePath} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        </svg>
    );
}
