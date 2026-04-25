"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface HeroFlowProps {
  className?: string;
}

export function HeroFlow({ className }: HeroFlowProps) {
  const reduced = useReducedMotion();

  // Path data: smooth cubic bezier from node centers
  // Node centers: (240,100), (240,240), (240,380)
  const path1 = "M240,130 C200,160 200,200 240,210";
  const path2 = "M240,270 C200,300 200,340 240,350";

  const nodeVariants = (delay: number) => ({
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] },
    },
  });

  const pathVariants = {
    initial: { pathLength: 0, opacity: 0 },
    animate: {
      pathLength: 1,
      opacity: 1,
      transition: { duration: 1.6, ease: "easeOut" },
    },
  };

  const staticPath = { opacity: 1, pathLength: 1 };
  const staticNode = { opacity: 1, scale: 1 };

  // Particle positions along the paths (framer-motion keyframe approach)
  const particleVariants1 = {
    animate: {
      offsetDistance: ["0%", "100%"],
      opacity: [0, 0.6, 0.6, 0],
      transition: { duration: 4, repeat: Infinity, ease: "linear", delay: 0 },
    },
  };

  const particleVariants2 = {
    animate: {
      offsetDistance: ["0%", "100%"],
      opacity: [0, 0.6, 0.6, 0],
      transition: { duration: 4, repeat: Infinity, ease: "linear", delay: 2 },
    },
  };

  return (
    <svg
      viewBox="0 0 480 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Aurora gradient for paths */}
        <linearGradient id="hf-aurora-grad-1" x1="240" y1="130" x2="240" y2="210" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22E1D7" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="hf-aurora-grad-2" x1="240" y1="270" x2="240" y2="350" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#FF5C9C" />
        </linearGradient>
        {/* Node ring gradient */}
        <linearGradient id="hf-node-grad-1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22E1D7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#22E1D7" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="hf-node-grad-2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="hf-node-grad-3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF5C9C" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#FF5C9C" stopOpacity="0.2" />
        </linearGradient>
        {/* Soft glow filters */}
        <filter id="hf-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="hf-glow-violet" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="hf-glow-magenta" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Connection path 1: node1 → node2 ── */}
      <motion.path
        d={path1}
        stroke="url(#hf-aurora-grad-1)"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={reduced ? staticPath : { pathLength: 0, opacity: 0 }}
        animate={reduced ? staticPath : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      />

      {/* ── Connection path 2: node2 → node3 ── */}
      <motion.path
        d={path2}
        stroke="url(#hf-aurora-grad-2)"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={reduced ? staticPath : { pathLength: 0, opacity: 0 }}
        animate={reduced ? staticPath : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: "easeOut", delay: 0.3 }}
      />

      {/* ── Particles traveling the paths ──
          Use SVG SMIL <animateMotion> for native path traversal.
          framer-motion can't interpolate CSS offsetDistance reliably. */}
      {!reduced && (
        <>
          {/* Cyan particle on path 1 */}
          <circle r={3} fill="#22E1D7" fillOpacity={0.85} filter="url(#hf-glow-cyan)">
            <animateMotion
              dur="3.5s"
              repeatCount="indefinite"
              path={path1}
              rotate="auto"
              begin="0.6s"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.15;0.85;1"
              dur="3.5s"
              repeatCount="indefinite"
              begin="0.6s"
            />
          </circle>
          {/* Violet trailing particle on path 1 */}
          <circle r={2.5} fill="#8B5CF6" fillOpacity={0.7} filter="url(#hf-glow-violet)">
            <animateMotion dur="3.5s" repeatCount="indefinite" path={path1} begin="2.35s" />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.15;0.85;1"
              dur="3.5s"
              repeatCount="indefinite"
              begin="2.35s"
            />
          </circle>
          {/* Violet particle on path 2 */}
          <circle r={3} fill="#8B5CF6" fillOpacity={0.85} filter="url(#hf-glow-violet)">
            <animateMotion dur="3.5s" repeatCount="indefinite" path={path2} begin="1.1s" />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.15;0.85;1"
              dur="3.5s"
              repeatCount="indefinite"
              begin="1.1s"
            />
          </circle>
          {/* Magenta trailing particle on path 2 */}
          <circle r={2.5} fill="#FF5C9C" fillOpacity={0.7} filter="url(#hf-glow-magenta)">
            <animateMotion dur="3.5s" repeatCount="indefinite" path={path2} begin="2.85s" />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.15;0.85;1"
              dur="3.5s"
              repeatCount="indefinite"
              begin="2.85s"
            />
          </circle>
        </>
      )}

      {/* ────────────── Node 1 — Pre-visit (top) ────────────── */}
      <motion.g
        initial={reduced ? staticNode : { opacity: 0, scale: 0.8 }}
        animate={reduced ? staticNode : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ transformOrigin: "240px 100px" }}
      >
        {/* Outer glow ring */}
        <circle cx={240} cy={100} r={38} fill="rgba(34,225,215,0.05)" stroke="rgba(34,225,215,0.15)" strokeWidth={1} />
        {/* Main circle */}
        <circle cx={240} cy={100} r={28} fill="rgba(34,225,215,0.08)" stroke="url(#hf-node-grad-1)" strokeWidth={1.5} filter="url(#hf-glow-cyan)" />
        {/* Pre-visit icon: chat bubble */}
        <rect x={229} y={90} width={22} height={15} rx={3} stroke="#22E1D7" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
        <path d="M233,109 L236,113 L239,109" stroke="#22E1D7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity={0.9} />
        <line x1={233} y1={95} x2={247} y2={95} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.5} />
        <line x1={233} y1={99} x2={244} y2={99} stroke="#22E1D7" strokeWidth={1} strokeOpacity={0.5} />
        {/* Step label */}
        <text x={240} y={154} textAnchor="middle" fill="#22E1D7" fillOpacity={0.6} fontSize={9} fontFamily="monospace" letterSpacing={1}>PRE-VISIT</text>
      </motion.g>

      {/* ────────────── Node 2 — Visit (middle) ────────────── */}
      <motion.g
        initial={reduced ? staticNode : { opacity: 0, scale: 0.8 }}
        animate={reduced ? staticNode : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ transformOrigin: "240px 240px" }}
      >
        {/* Outer glow ring */}
        <circle cx={240} cy={240} r={38} fill="rgba(139,92,246,0.05)" stroke="rgba(139,92,246,0.15)" strokeWidth={1} />
        {/* Main circle */}
        <circle cx={240} cy={240} r={28} fill="rgba(139,92,246,0.08)" stroke="url(#hf-node-grad-2)" strokeWidth={1.5} filter="url(#hf-glow-violet)" />
        {/* Visit icon: stethoscope */}
        <path d="M233,233 C233,228 237,225 240,225 C243,225 247,228 247,233 C247,238 244,241 240,243" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
        <path d="M240,243 C240,249 244,253 249,253" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
        <circle cx={249} cy={255} r={2.5} stroke="#8B5CF6" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
        {/* Step label */}
        <text x={240} y={294} textAnchor="middle" fill="#8B5CF6" fillOpacity={0.6} fontSize={9} fontFamily="monospace" letterSpacing={1}>VISIT</text>
      </motion.g>

      {/* ────────────── Node 3 — Post-visit (bottom) ────────────── */}
      <motion.g
        initial={reduced ? staticNode : { opacity: 0, scale: 0.8 }}
        animate={reduced ? staticNode : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ transformOrigin: "240px 380px" }}
      >
        {/* Outer glow ring */}
        <circle cx={240} cy={380} r={38} fill="rgba(255,92,156,0.05)" stroke="rgba(255,92,156,0.15)" strokeWidth={1} />
        {/* Main circle */}
        <circle cx={240} cy={380} r={28} fill="rgba(255,92,156,0.08)" stroke="url(#hf-node-grad-3)" strokeWidth={1.5} filter="url(#hf-glow-magenta)" />
        {/* Post-visit icon: document */}
        <rect x={230} y={368} width={18} height={22} rx={2} stroke="#FF5C9C" strokeWidth={1.5} fill="none" strokeOpacity={0.9} />
        <line x1={234} y1={374} x2={244} y2={374} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
        <line x1={234} y1={378} x2={244} y2={378} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
        <line x1={234} y1={382} x2={240} y2={382} stroke="#FF5C9C" strokeWidth={1} strokeOpacity={0.5} />
        {/* Step label */}
        <text x={240} y={434} textAnchor="middle" fill="#FF5C9C" fillOpacity={0.6} fontSize={9} fontFamily="monospace" letterSpacing={1}>POST-VISIT</text>
      </motion.g>

      {/* Ambient floating dots (decorative) */}
      <circle cx={160} cy={140} r={2} fill="#22E1D7" fillOpacity={0.15} />
      <circle cx={320} cy={200} r={1.5} fill="#8B5CF6" fillOpacity={0.2} />
      <circle cx={150} cy={300} r={2} fill="#FF5C9C" fillOpacity={0.12} />
      <circle cx={330} cy={340} r={1.5} fill="#22E1D7" fillOpacity={0.15} />
      <circle cx={170} cy={420} r={2} fill="#8B5CF6" fillOpacity={0.12} />
    </svg>
  );
}
