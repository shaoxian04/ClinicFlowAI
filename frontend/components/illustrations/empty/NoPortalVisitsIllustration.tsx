"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface NoPortalVisitsIllustrationProps {
  className?: string;
}

export function NoPortalVisitsIllustration({ className }: NoPortalVisitsIllustrationProps) {
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
      aria-label="No visits found"
    >
      <title>No visits found</title>
      <defs>
        <linearGradient id="npv-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22E1D7" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* Calendar outer */}
      <rect x={28} y={40} width={104} height={90} rx={6} stroke="url(#npv-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.04)" />
      {/* Calendar header bar */}
      <rect x={28} y={40} width={104} height={22} rx={6} stroke="url(#npv-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.08)" />
      <rect x={33} y={40} width={98} height={16} rx={0} fill="rgba(34,225,215,0.04)" />
      {/* Calendar pins */}
      <line x1={52} y1={32} x2={52} y2={48} stroke="#22E1D7" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.7} />
      <line x1={108} y1={32} x2={108} y2={48} stroke="#22E1D7" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.7} />
      {/* Month label placeholder */}
      <line x1={62} y1={50} x2={98} y2={50} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.3} />
      {/* Grid of empty day cells */}
      {[0, 1, 2, 3, 4, 5, 6].map((col) =>
        [0, 1, 2, 3].map((row) => {
          const cx = 40 + col * 14;
          const cy = 74 + row * 14;
          return (
            <rect
              key={`${col}-${row}`}
              x={cx - 4}
              y={cy - 4}
              width={8}
              height={8}
              rx={1.5}
              stroke="#8B5CF6"
              strokeWidth={0.8}
              strokeOpacity={0.18}
              fill="none"
            />
          );
        })
      )}
      {/* Clock icon bottom-right */}
      <circle cx={116} cy={118} r={14} stroke="url(#npv-grad)" strokeWidth={1.5} fill="rgba(139,92,246,0.06)" />
      <line x1={116} y1={112} x2={116} y2={118} stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.8} />
      <line x1={116} y1={118} x2={121} y2={121} stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeOpacity={0.8} />
    </motion.svg>
  );
}
