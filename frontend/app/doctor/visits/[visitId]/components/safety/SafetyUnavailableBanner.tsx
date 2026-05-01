// CloudOffIcon is not in @/components/icons — using an inline SVG equivalent.

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 0 0 3 16.3" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function SafetyUnavailableBanner({ reason }: { reason?: string }) {
  return (
    <div
      className="bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass rounded-sm p-3 border-fog-dim/40 flex items-center gap-3"
      role="status"
    >
      <CloudOffIcon className="h-5 w-5 text-fog-dim" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fog-dim">
          Safety validation unavailable — proceed with manual review
        </div>
        {reason && <div className="text-xs text-fog-dim mt-0.5">{reason}</div>}
      </div>
    </div>
  );
}
