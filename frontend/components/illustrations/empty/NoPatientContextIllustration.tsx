"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface NoPatientContextIllustrationProps {
  className?: string;
}

export function NoPatientContextIllustration({ className }: NoPatientContextIllustrationProps) {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "w-32 h-32"}
      initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      aria-label="No patient context available"
    >
      <title>No patient context available</title>
      <defs>
        <linearGradient id="npc-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22E1D7" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* Root node */}
      <circle cx={80} cy={42} r={14} stroke="url(#npc-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.08)" />
      <circle cx={80} cy={42} r={4} fill="#22E1D7" fillOpacity={0.5} />

      {/* Branch lines from root */}
      <line x1={68} y1={52} x2={44} y2={82} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.4} strokeLinecap="round" />
      <line x1={80} y1={56} x2={80} y2={90} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.4} strokeLinecap="round" />
      <line x1={92} y1={52} x2={116} y2={82} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.4} strokeLinecap="round" />

      {/* Level 2 nodes — dashed outlines (not yet populated) */}
      <circle cx={44} cy={90} r={12} stroke="#22E1D7" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="rgba(34,225,215,0.03)" />
      <circle cx={80} cy={98} r={12} stroke="#8B5CF6" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="rgba(139,92,246,0.03)" />
      <circle cx={116} cy={90} r={12} stroke="#8B5CF6" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="rgba(139,92,246,0.03)" />

      {/* Level 3 branches from left node */}
      <line x1={36} y1={100} x2={26} y2={122} stroke="#22E1D7" strokeWidth={0.8} strokeOpacity={0.25} strokeLinecap="round" />
      <line x1={52} y1={100} x2={58} y2={122} stroke="#22E1D7" strokeWidth={0.8} strokeOpacity={0.25} strokeLinecap="round" />

      {/* Level 3 leaf nodes — very faint */}
      <circle cx={26} cy={128} r={8} stroke="#22E1D7" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.2} fill="none" />
      <circle cx={58} cy={128} r={8} stroke="#22E1D7" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.2} fill="none" />

      {/* Level 3 branches from right node */}
      <line x1={110} y1={100} x2={100} y2={122} stroke="#8B5CF6" strokeWidth={0.8} strokeOpacity={0.25} strokeLinecap="round" />
      <line x1={122} y1={100} x2={134} y2={122} stroke="#8B5CF6" strokeWidth={0.8} strokeOpacity={0.25} strokeLinecap="round" />

      <circle cx={100} cy={128} r={8} stroke="#8B5CF6" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.2} fill="none" />
      <circle cx={134} cy={128} r={8} stroke="#8B5CF6" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.2} fill="none" />
    </motion.svg>
  );
}
