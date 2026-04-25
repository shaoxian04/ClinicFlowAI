"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface NoReportYetIllustrationProps {
  className?: string;
}

export function NoReportYetIllustration({ className }: NoReportYetIllustrationProps) {
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
      aria-label="Report not yet generated"
    >
      <title>Report not yet generated</title>
      <defs>
        <linearGradient id="nry-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22E1D7" />
          <stop offset="60%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#FF5C9C" />
        </linearGradient>
      </defs>
      {/* Document body */}
      <rect x={36} y={38} width={76} height={96} rx={5} stroke="url(#nry-grad)" strokeWidth={1.5} fill="rgba(34,225,215,0.04)" />
      {/* Dotted lines on document */}
      <line x1={48} y1={62} x2={100} y2={62} stroke="#22E1D7" strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.25} />
      <line x1={48} y1={74} x2={100} y2={74} stroke="#22E1D7" strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.2} />
      <line x1={48} y1={86} x2={90} y2={86} stroke="#22E1D7" strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.15} />
      <line x1={48} y1={98} x2={94} y2={98} stroke="#22E1D7" strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.12} />
      <line x1={48} y1={110} x2={84} y2={110} stroke="#22E1D7" strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.09} />
      {/* Pen hovering above document, tilted */}
      <g transform="translate(90, 28) rotate(40)">
        {/* Pen body */}
        <rect x={-4} y={-20} width={8} height={30} rx={2} stroke="url(#nry-grad)" strokeWidth={1.5} fill="rgba(139,92,246,0.08)" />
        {/* Pen nib */}
        <path d="M-4,10 L0,18 L4,10" stroke="url(#nry-grad)" strokeWidth={1.5} strokeLinejoin="round" fill="rgba(255,92,156,0.1)" />
        {/* Pen clip */}
        <line x1={2} y1={-18} x2={2} y2={4} stroke="#8B5CF6" strokeWidth={0.8} strokeOpacity={0.5} />
      </g>
      {/* Ink dot suggestion near nib */}
      <circle cx={110} cy={50} r={2.5} fill="#FF5C9C" fillOpacity={0.4} />
    </motion.svg>
  );
}
