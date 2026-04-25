import * as React from "react";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const base = (size: number | undefined, className: string | undefined, strokeWidth?: number) => ({
  width: size ?? 24,
  height: size ?? 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: strokeWidth ?? 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export function CheckIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <polyline points="4 12.5 9 17.5 20 7" />
    </svg>
  );
}

export function XIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function ChevronDownIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function FileTextIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

export function StethoscopeIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <path d="M4.5 6.5A4 4 0 0 1 12 6" />
      <path d="M12 6a4 4 0 0 1 4 4c0 2.5-2 4.5-4.5 5.5" />
      <path d="M11.5 15.5C11.5 18.5 14 21 17 21" />
      <circle cx="17" cy="21" r="2" />
      <line x1="4" y1="4" x2="4" y2="10" />
    </svg>
  );
}

export function PulseIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <polyline points="2 12 6 12 8 5 11 19 14 9 16 12 22 12" />
    </svg>
  );
}

export function PillIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <rect x="3" y="10" width="18" height="8" rx="4" transform="rotate(-45 12 14)" />
      <line x1="8.5" y1="15.5" x2="15.5" y2="8.5" />
    </svg>
  );
}

export function CalendarIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function ClockIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

export function MicIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

export function SparklesIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z" />
      <path d="M5 15l.75 2.25L8 18l-2.25.75L5 21l-.75-2.25L2 18l2.25-.75z" />
    </svg>
  );
}

export function SearchIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
    </svg>
  );
}

export function CommandIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

export function GlobeIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
    </svg>
  );
}

export function ArrowRightIcon({ size, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)} aria-hidden="true">
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  );
}
