"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface ProcessDiagramProps {
  className?: string;
}

export function ProcessDiagram({ className }: ProcessDiagramProps) {
  const reduced = useReducedMotion();

  // Desktop: horizontal at y=60. Node centers at x=150, 450, 750 in 900x120 viewbox
  // Paths connect node edges
  const pathH1 = "M190,60 C270,60 330,60 410,60";
  const pathH2 = "M490,60 C570,60 630,60 710,60";

  // Vertical layout 120x500: nodes at y=80, 250, 420
  const pathV1 = "M60,120 C60,160 60,190 60,230";
  const pathV2 = "M60,290 C60,330 60,360 60,400";

  const pathIn = { pathLength: 0, opacity: 0 };
  const pathFinal = { pathLength: 1, opacity: 1 };

  const nodeIn = { opacity: 0, scale: 0.85 };
  const nodeFinal = { opacity: 1, scale: 1 };

  return (
    <>
      {/* ── Desktop horizontal (≥768px) ── */}
      <svg
        viewBox="0 0 900 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`hidden md:block w-full ${className ?? ""}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pd-grad-1" x1="190" y1="60" x2="410" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22E1D7" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="pd-grad-2" x1="490" y1="60" x2="710" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#FF5C9C" />
          </linearGradient>
        </defs>

        {/* Path 1 */}
        <motion.path
          d={pathH1}
          stroke="url(#pd-grad-1)"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          initial={reduced ? pathFinal : pathIn}
          whileInView={pathFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />

        {/* Path 2 */}
        <motion.path
          d={pathH2}
          stroke="url(#pd-grad-2)"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          initial={reduced ? pathFinal : pathIn}
          whileInView={pathFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
        />

        {/* Data packets — SMIL animateMotion follows the actual path
            with infinite loop independent of viewport state. */}
        {!reduced && (
          <>
            <circle r={4} fill="#22E1D7" fillOpacity={0.9}>
              <animateMotion dur="2.4s" repeatCount="indefinite" path={pathH1} begin="1.2s" />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.15;0.85;1"
                dur="2.4s"
                repeatCount="indefinite"
                begin="1.2s"
              />
            </circle>
            <circle r={4} fill="#FF5C9C" fillOpacity={0.9}>
              <animateMotion dur="2.4s" repeatCount="indefinite" path={pathH2} begin="2.0s" />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.15;0.85;1"
                dur="2.4s"
                repeatCount="indefinite"
                begin="2.0s"
              />
            </circle>
          </>
        )}

        {/* Node 1 — Pre-visit */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0 }}
          style={{ transformOrigin: "150px 60px" }}
        >
          <circle cx={150} cy={60} r={32} fill="rgba(34,225,215,0.06)" stroke="rgba(34,225,215,0.3)" strokeWidth={1.5} />
          {/* Chat bubble icon */}
          <rect x={138} y={51} width={20} height={14} rx={3} stroke="#22E1D7" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
          <path d="M142,69 L145,73 L148,69" stroke="#22E1D7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity={0.9} />
          <text x={150} y={102} textAnchor="middle" fill="#22E1D7" fillOpacity={0.5} fontSize={8} fontFamily="monospace" letterSpacing={0.8}>PRE-VISIT</text>
        </motion.g>

        {/* Node 2 — Visit */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.35 }}
          style={{ transformOrigin: "450px 60px" }}
        >
          <circle cx={450} cy={60} r={32} fill="rgba(139,92,246,0.06)" stroke="rgba(139,92,246,0.3)" strokeWidth={1.5} />
          {/* Stethoscope icon */}
          <path d="M442,52 C442,48 445,46 448,46 C451,46 454,48 454,52 C454,56 452,58 450,59" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
          <path d="M450,59 C450,63 453,66 457,66" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
          <circle cx={457} cy={67.5} r={2} stroke="#8B5CF6" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
          <text x={450} y={102} textAnchor="middle" fill="#8B5CF6" fillOpacity={0.5} fontSize={8} fontFamily="monospace" letterSpacing={0.8}>VISIT</text>
        </motion.g>

        {/* Node 3 — Post-visit */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.7 }}
          style={{ transformOrigin: "750px 60px" }}
        >
          <circle cx={750} cy={60} r={32} fill="rgba(255,92,156,0.06)" stroke="rgba(255,92,156,0.3)" strokeWidth={1.5} />
          {/* Document icon */}
          <rect x={740} y={49} width={18} height={22} rx={2} stroke="#FF5C9C" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
          <line x1={744} y1={55} x2={754} y2={55} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
          <line x1={744} y1={59} x2={754} y2={59} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
          <line x1={744} y1={63} x2={750} y2={63} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
          <text x={750} y={102} textAnchor="middle" fill="#FF5C9C" fillOpacity={0.5} fontSize={8} fontFamily="monospace" letterSpacing={0.8}>POST-VISIT</text>
        </motion.g>
      </svg>

      {/* ── Mobile vertical (<768px) ── */}
      <svg
        viewBox="0 0 120 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`block md:hidden w-24 mx-auto ${className ?? ""}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pd-v-grad-1" x1="60" y1="120" x2="60" y2="230" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22E1D7" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="pd-v-grad-2" x1="60" y1="290" x2="60" y2="400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#FF5C9C" />
          </linearGradient>
        </defs>

        <motion.path
          d={pathV1}
          stroke="url(#pd-v-grad-1)"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          initial={reduced ? pathFinal : pathIn}
          whileInView={pathFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />
        <motion.path
          d={pathV2}
          stroke="url(#pd-v-grad-2)"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          initial={reduced ? pathFinal : pathIn}
          whileInView={pathFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
        />

        {/* Node 1 */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          style={{ transformOrigin: "60px 80px" }}
        >
          <circle cx={60} cy={80} r={26} fill="rgba(34,225,215,0.06)" stroke="rgba(34,225,215,0.3)" strokeWidth={1.5} />
          <rect x={51} y={72} width={18} height={13} rx={3} stroke="#22E1D7" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
          <path d="M55,88 L58,92 L61,88" stroke="#22E1D7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity={0.9} />
        </motion.g>

        {/* Node 2 */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.35 }}
          style={{ transformOrigin: "60px 260px" }}
        >
          <circle cx={60} cy={260} r={26} fill="rgba(139,92,246,0.06)" stroke="rgba(139,92,246,0.3)" strokeWidth={1.5} />
          <path d="M53,252 C53,248 56,246 59,246 C62,246 65,248 65,252 C65,255 63,257 60,258" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
          <path d="M60,258 C60,262 63,265 67,265" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
          <circle cx={67} cy={266.5} r={2} stroke="#8B5CF6" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
        </motion.g>

        {/* Node 3 */}
        <motion.g
          initial={reduced ? nodeFinal : nodeIn}
          whileInView={nodeFinal}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.7 }}
          style={{ transformOrigin: "60px 440px" }}
        >
          <circle cx={60} cy={440} r={26} fill="rgba(255,92,156,0.06)" stroke="rgba(255,92,156,0.3)" strokeWidth={1.5} />
          <rect x={51} y={429} width={18} height={22} rx={2} stroke="#FF5C9C" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
          <line x1={55} y1={435} x2={65} y2={435} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
          <line x1={55} y1={439} x2={65} y2={439} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
          <line x1={55} y1={443} x2={61} y2={443} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
        </motion.g>
      </svg>
    </>
  );
}
