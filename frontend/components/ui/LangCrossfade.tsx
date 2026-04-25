"use client";

import { useEffect, useRef, useState } from "react";

export interface LangCrossfadeProps {
  lang: string;
  children: React.ReactNode;
  durationMs?: number;
}

export function LangCrossfade({
  lang,
  children,
  durationMs = 200,
}: LangCrossfadeProps) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [displayedLang, setDisplayedLang] = useState(lang);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [filterScale, setFilterScale] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const filterRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const prevLangRef = useRef(lang);
  const animatingRef = useRef(false);
  const raf1Ref = useRef<number | null>(null);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (raf1Ref.current !== null) cancelAnimationFrame(raf1Ref.current);
    if (timer1Ref.current !== null) clearTimeout(timer1Ref.current);
    if (timer2Ref.current !== null) clearTimeout(timer2Ref.current);
  }

  useEffect(() => {
    if (lang === prevLangRef.current) {
      setDisplayedChildren(children);
      return;
    }

    prevLangRef.current = lang;

    if (reducedMotion) {
      setDisplayedLang(lang);
      setDisplayedChildren(children);
      return;
    }

    if (animatingRef.current) {
      clearTimers();
      animatingRef.current = false;
    }

    animatingRef.current = true;

    // Phase 1: warp out (scale up filter, fade out)
    raf1Ref.current = requestAnimationFrame(() => {
      setFilterScale(25);
      setOpacity(0);

      // Phase 2: swap content at midpoint
      timer1Ref.current = setTimeout(() => {
        setDisplayedLang(lang);
        setDisplayedChildren(children);

        // Phase 3: warp in (scale down filter, fade in)
        timer2Ref.current = setTimeout(() => {
          setFilterScale(0);
          setOpacity(1);
          animatingRef.current = false;
        }, durationMs / 2);
      }, durationMs / 2);
    });

    return () => clearTimers();
  }, [lang, children, durationMs, reducedMotion]);

  const halfDuration = durationMs / 2;

  return (
    <>
      {/* SVG filter definition — hidden, rendered once */}
      <svg
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        aria-hidden="true"
      >
        <defs>
          <filter id="ink-bleed" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="3"
              result="turb"
              seed="1"
            />
            <feDisplacementMap
              ref={filterRef}
              in="SourceGraphic"
              in2="turb"
              scale={filterScale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        ref={contentRef}
        key={displayedLang}
        style={{
          opacity,
          filter: filterScale > 0 ? "url(#ink-bleed)" : undefined,
          transition: `opacity ${halfDuration}ms ease, filter ${halfDuration}ms ease`,
        }}
      >
        {displayedChildren}
      </div>
    </>
  );
}
