"use client";

export type TimelineDot = {
    /** ISO date YYYY-MM-DD */
    date: string;
    /** Visual treatment — "filled" (cyan dot) for past, "ring" (cyan outline) for upcoming */
    kind: "filled" | "ring";
    /** Tooltip on hover */
    label?: string;
};

type Props = {
    dots: TimelineDot[];
    height?: number;
    className?: string;
};

/**
 * Horizontal timeline with date dots. Spans from the earliest dot to the latest;
 * dots position proportionally. "Today" is implicit — caller decides which dots
 * are filled vs ring.
 */
export function TimelineChart({ dots, height = 80, className }: Props) {
    if (dots.length === 0) {
        return <p className="font-sans text-xs text-fog-dim/60">No journey data yet.</p>;
    }
    const xs = dots.map((d) => new Date(d.date + "T00:00:00").getTime());
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const range = max - min || 1;
    const sx = (t: number) => 4 + ((t - min) / range) * 92;  // % units, 4-96 for padding

    return (
        <div className={className} style={{ position: "relative", height, padding: "20px 0" }}>
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    left: "4%",
                    right: "4%",
                    top: "50%",
                    height: 1,
                    background: "#1a2238",
                }}
            />
            {dots.map((d, i) => {
                const t = new Date(d.date + "T00:00:00").getTime();
                const left = `${sx(t).toFixed(2)}%`;
                const isRing = d.kind === "ring";
                const dot = (
                    <div
                        key={i}
                        title={d.label ?? d.date}
                        style={{
                            position: "absolute",
                            left,
                            top: `calc(50% - ${isRing ? 7 : 5}px)`,
                            width: isRing ? 14 : 10,
                            height: isRing ? 14 : 10,
                            borderRadius: "50%",
                            background: isRing ? "rgba(45,212,191,0.18)" : "#2dd4bf",
                            border: isRing ? "2px solid #2dd4bf" : "none",
                            transform: "translateX(-50%)",
                        }}
                    />
                );
                return dot;
            })}
            <div
                style={{
                    position: "absolute",
                    left: 4,
                    bottom: 0,
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "rgba(154,163,184,0.6)",
                    letterSpacing: "0.1em",
                }}
            >
                PAST
            </div>
            <div
                style={{
                    position: "absolute",
                    right: 4,
                    bottom: 0,
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "#2dd4bf",
                    letterSpacing: "0.1em",
                }}
            >
                UPCOMING ↑
            </div>
        </div>
    );
}
