"use client";

import { AnimatePresence, motion } from "framer-motion";
import { stampSettle } from "@/design/motion";

export interface SignatureStampProps {
  visible: boolean;
  doctorName?: string;
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (
    (parts[0][0]?.toUpperCase() ?? "") +
    (parts[parts.length - 1][0]?.toUpperCase() ?? "")
  );
}

export function SignatureStamp({ visible, doctorName }: SignatureStampProps) {
  const initials = getInitials(doctorName);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="signature-stamp"
          className="absolute top-3 right-3 pointer-events-none z-10 opacity-60"
          variants={reducedMotion ? undefined : stampSettle}
          initial={reducedMotion ? { opacity: 0.6, scale: 1, rotate: -2 } : "initial"}
          animate={reducedMotion ? { opacity: 0.6, scale: 1, rotate: -2 } : "animate"}
          exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
        >
          <span className="sr-only">Signed by {doctorName || "Doctor"}</span>
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="seal-depth" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stopColor="#FF9A82" />
                <stop offset="100%" stopColor="#CC4D2F" />
              </radialGradient>
            </defs>

            {/* Outer decorative ring */}
            <circle
              cx="40"
              cy="40"
              r="37"
              fill="none"
              stroke="#FF7759"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              opacity="0.7"
            />

            {/* Main seal body */}
            <circle
              cx="40"
              cy="40"
              r="33"
              fill="url(#seal-depth)"
              opacity="0.85"
            />

            {/* Inner ring */}
            <circle
              cx="40"
              cy="40"
              r="29"
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="0.75"
            />

            {/* "CLINIFLOW" text along top arc — simplified as centered text */}
            <text
              x="40"
              y="20"
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="6"
              fontWeight="600"
              fill="rgba(255,255,255,0.9)"
              letterSpacing="2"
            >
              CLINIFLOW
            </text>

            {/* Checkmark */}
            <path
              d="M29 40 L36 47 L52 33"
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Doctor initials */}
            {initials && (
              <text
                x="40"
                y="60"
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="9"
                fontWeight="700"
                fill="rgba(255,255,255,0.85)"
                letterSpacing="1"
              >
                {initials}
              </text>
            )}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
