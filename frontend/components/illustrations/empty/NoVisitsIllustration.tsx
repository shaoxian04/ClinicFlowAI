"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface NoVisitsIllustrationProps {
  className?: string;
}

export function NoVisitsIllustration({ className }: NoVisitsIllustrationProps) {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "w-40 h-40"}
      initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      aria-label="No visits yet"
    >
      <title>No visits yet</title>
      <defs>
        <linearGradient id="nv-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22E1D7" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* Clipboard body */}
      <rect x={38} y={36} width={84} height={100} rx={6} stroke="url(#nv-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.04)" />
      {/* Clipboard clip */}
      <rect x={58} y={28} width={44} height={18} rx={4} stroke="url(#nv-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.06)" />
      {/* Empty rows */}
      <line x1={52} y1={68} x2={108} y2={68} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.25} />
      <line x1={52} y1={82} x2={108} y2={82} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.2} />
      <line x1={52} y1={96} x2={100} y2={96} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.15} />
      <line x1={52} y1={110} x2={88} y2={110} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.1} />
      {/* Plus icon */}
      <circle cx={80} cy={58} r={10} stroke="url(#nv-grad)" strokeWidth={1.5} fill="rgba(139,92,246,0.06)" />
      <line x1={80} y1={53} x2={80} y2={63} stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.8} />
      <line x1={75} y1={58} x2={85} y2={58} stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.8} />
    </motion.svg>
  );
}
