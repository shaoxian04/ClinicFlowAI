"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface NoMedicationsIllustrationProps {
  className?: string;
}

export function NoMedicationsIllustration({ className }: NoMedicationsIllustrationProps) {
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
      aria-label="No medications prescribed"
    >
      <title>No medications prescribed</title>
      <defs>
        <linearGradient id="nm-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#FF5C9C" />
        </linearGradient>
      </defs>
      {/* Prescription pad outline */}
      <rect x={34} y={26} width={92} height={112} rx={6} stroke="url(#nm-grad)" strokeWidth={1.5} fill="rgba(139,92,246,0.04)" />
      {/* Torn top edge suggestion */}
      <path d="M34,42 L126,42" stroke="#8B5CF6" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.3} />
      {/* Rx symbol */}
      <text x={52} y={70} fontSize={22} fontFamily="Georgia, serif" fill="url(#nm-grad)" fillOpacity={0.7} fontWeight="bold">Rx</text>
      {/* Empty prescription lines */}
      <line x1={46} y1={86} x2={114} y2={86} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.2} />
      <line x1={46} y1={98} x2={108} y2={98} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.16} />
      <line x1={46} y1={110} x2={96} y2={110} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.12} />
      <line x1={46} y1={122} x2={102} y2={122} stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.09} />
      {/* Pill decoration bottom-right */}
      <rect x={96} y={112} width={22} height={12} rx={6} stroke="url(#nm-grad)" strokeWidth={1.5} fill="rgba(255,92,156,0.06)" transform="rotate(-30 107 118)" />
      <line x1={107} y1={112} x2={107} y2={124} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.4} transform="rotate(-30 107 118)" />
    </motion.svg>
  );
}
