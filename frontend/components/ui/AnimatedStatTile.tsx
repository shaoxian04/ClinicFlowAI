"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/design/cn";
import { countUp, fadeUp } from "@/design/motion";

export interface AnimatedStatTileProps {
  label: string;
  value: number;
  sparklineData?: number[];
  className?: string;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 80;
  const H = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="text-cyan/60 mt-2"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AnimatedStatTile({
  label,
  value,
  sparklineData,
  className,
}: AnimatedStatTileProps) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const mv = useMotionValue(reducedMotion ? value : 0);
  const spring = useSpring(mv, countUp);
  const display = useTransform(spring, (v) => Math.round(v).toString());
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    if (!reducedMotion) {
      mv.set(value);
    }
  }, [mv, value, reducedMotion]);

  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        "flex flex-col bg-ink-well border border-ink-rim rounded-sm p-4",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      <motion.span
        className="font-mono text-4xl font-bold text-cyan glow-cyan tabular-nums leading-none"
      >
        {reducedMotion ? value.toString() : <motion.span>{display}</motion.span>}
      </motion.span>

      {sparklineData && sparklineData.length > 1 && (
        <Sparkline data={sparklineData} />
      )}

      <span className="font-mono text-[10px] text-fog-dim uppercase tracking-wider mt-2">
        {label}
      </span>
    </motion.div>
  );
}
