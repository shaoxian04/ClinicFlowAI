"use client";

import Link from "next/link";
import { useEffect } from "react";
import { HeroEmblem } from "./components/HeroEmblem";
import { LeafGlyph } from "./components/Leaf";

export default function Home() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heroRight = document.querySelector<HTMLElement>(".land-hero-right");
    const progress = document.querySelector<HTMLElement>(".scroll-progress");
    if (!heroRight && !progress) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (heroRight && !reduced) {
          const translate = Math.min(y, 400) * 0.025;
          heroRight.style.transform = `translate3d(0, ${translate}px, 0)`;
        }
        if (progress) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          const ratio = max > 0 ? Math.min(Math.max(y / max, 0), 1) : 0;
          progress.style.transform = `scaleX(${ratio})`;
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <main className="landing">
      <div className="scroll-progress" aria-hidden="true" />
      {/* ============ HERO ============ */}
      <section className="land-section land-hero">
        <div className="land-hero-left">
          <span className="land-eyebrow-leaf reveal" style={{ ["--reveal-delay" as string]: "0ms" }}>
            <LeafGlyph size={14} />
            CliniFlow AI · For Malaysian clinics
          </span>
          <h1 className="land-hero-title reveal" style={{ ["--reveal-delay" as string]: "80ms" }}>
            More minutes with your doctor. <em>Fewer minutes on paperwork.</em>
          </h1>
          <p className="land-hero-sub reveal" style={{ ["--reveal-delay" as string]: "180ms" }}>
            CliniFlow helps your clinic run a calmer visit. We listen so your doctor can talk to you — then
            send you home with a clear summary in English and Bahasa Melayu, written for people, not charts.
          </p>
          <div className="land-cta-row reveal" style={{ ["--reveal-delay" as string]: "260ms" }}>
            <Link href="/login" className="btn btn-accent">
              Sign in to continue
            </Link>
            <a href="#flow" className="btn btn-ghost">
              See how it works ↓
            </a>
          </div>
          <div className="trust-row reveal" style={{ ["--reveal-delay" as string]: "340ms" }}>
            <span className="pill pill-primary">Private by design</span>
            <span className="pill pill-good">Doctor-reviewed</span>
            <span className="pill">Bilingual summaries</span>
          </div>
        </div>
        <div className="land-hero-right reveal" style={{ ["--reveal-delay" as string]: "380ms" }}>
          <div className="land-seal-wrap">
            <HeroEmblem size={300} />
            <div className="land-seal-meta">Pre-visit · Visit · Summary</div>
          </div>
        </div>
      </section>

      {/* ============ THREE STEPS ============ */}
      <section className="land-section" id="flow">
        <span className="eyebrow reveal">How a visit works</span>
        <h2 className="land-section-title reveal" style={{ ["--reveal-delay" as string]: "60ms" }}>
          From the first <em>symptom</em> to a summary you can actually read.
        </h2>

        <div className="land-steps">
          <article className="land-step reveal" style={{ ["--reveal-delay" as string]: "80ms" }}>
            <div className="land-step-num">01</div>
            <div className="land-step-eyebrow">Before the visit</div>
            <h3 className="land-step-title">Tell us how you&apos;re feeling — from home.</h3>
            <p className="land-step-body">
              A friendly chat asks what&apos;s bothering you, how long it&apos;s lasted, and any medicines or
              allergies. Your doctor reads it before you sit down, so the visit starts already understood.
            </p>
            <div className="land-step-foot">
              <span className="pill">What hurts</span>
              <span className="pill">How long</span>
              <span className="pill">Your medicines</span>
            </div>
          </article>

          <article className="land-step reveal" style={{ ["--reveal-delay" as string]: "160ms" }}>
            <div className="land-step-num">02</div>
            <div className="land-step-eyebrow">During the visit</div>
            <h3 className="land-step-title">Your doctor focuses on you — not a keyboard.</h3>
            <p className="land-step-body">
              The AI drafts the medical note in the background while your doctor talks to you. Your doctor then
              reviews every word, edits what&apos;s needed, and signs it off before it becomes your record.
            </p>
            <div className="land-step-foot">
              <span className="pill pill-warn">AI draft</span>
              <span className="pill pill-good">✓ Doctor signed</span>
            </div>
          </article>

          <article className="land-step reveal" style={{ ["--reveal-delay" as string]: "240ms" }}>
            <div className="land-step-num">03</div>
            <div className="land-step-eyebrow">After the visit</div>
            <h3 className="land-step-title">Go home with a summary you understand.</h3>
            <p className="land-step-body">
              Get a plain-language recap of what was discussed and what to do next, in both English and Bahasa
              Melayu — plus clear instructions for every medicine: what it&apos;s for, how much, and when.
            </p>
            <div className="land-step-foot">
              <span className="pill pill-primary">English</span>
              <span className="pill pill-primary">Bahasa Melayu</span>
              <span className="pill">Medicine instructions</span>
            </div>
          </article>
        </div>
      </section>

      {/* ============ DIFFERENTIATORS ============ */}
      <section className="land-section">
        <span className="eyebrow reveal">What makes it different</span>
        <h2 className="land-section-title reveal" style={{ ["--reveal-delay" as string]: "60ms" }}>
          Two ideas that change how your visit feels.
        </h2>

        <div className="land-diff">
          <div className="land-diff-col reveal" style={{ ["--reveal-delay" as string]: "80ms" }}>
            <span className="land-eyebrow-leaf">
              <LeafGlyph size={12} />
              Remembers you
            </span>
            <h3 className="land-diff-title">
              Your doctor walks in <em>already knowing you.</em>
            </h3>
            <p className="land-diff-body">
              Past symptoms, diagnoses, medications, and allergies follow you from one visit to the next — so
              you don&apos;t repeat your story every time. Your doctor spends the visit caring, not catching up.
            </p>
          </div>

          <div className="land-diff-divider">
            <span className="land-diff-divider-glyph">
              <LeafGlyph size={16} color="var(--primary)" />
            </span>
          </div>

          <div className="land-diff-col reveal" style={{ ["--reveal-delay" as string]: "180ms" }}>
            <span className="land-eyebrow-leaf" style={{ color: "var(--accent)" }}>
              <LeafGlyph size={12} color="var(--accent)" />
              Learns the wording, not the decisions
            </span>
            <h3 className="land-diff-title">
              The AI picks up your doctor&apos;s <em>style</em> — never their <em>judgment.</em>
            </h3>
            <p className="land-diff-body">
              Over time, notes start to sound like your doctor: their shorthand, their tone, their structure.
              But the medical decisions — what you&apos;re prescribed, what condition you have, what&apos;s
              safe — always come from a human, never from a learned pattern.
            </p>
          </div>
        </div>
      </section>

      {/* ============ SAFETY INVARIANTS ============ */}
      <section className="land-section">
        <span className="eyebrow reveal">Our promises to you</span>
        <h2 className="land-section-title reveal" style={{ ["--reveal-delay" as string]: "60ms" }}>
          Four lines we will <em>never</em> cross.
        </h2>

        <div className="land-invariants">
          {[
            {
              n: "I",
              text: (
                <>
                  <strong>A doctor always signs off</strong> before your note is final. You&apos;ll clearly see
                  when you&apos;re looking at an AI draft versus a record a doctor has confirmed.
                </>
              ),
            },
            {
              n: "II",
              text: (
                <>
                  The AI can learn how your doctor <strong>writes</strong> — but never what to prescribe, what to
                  diagnose, or when to raise an alarm. Those decisions stay with your doctor.
                </>
              ),
            },
            {
              n: "III",
              text: (
                <>
                  Your medical history is <strong>kept intact</strong> — no entry can be quietly deleted or
                  rewritten. A clear trail exists for every change, always.
                </>
              ),
            },
            {
              n: "IV",
              text: (
                <>
                  Your data is <strong>handled under PDPA</strong>, stored in Malaysia-friendly infrastructure,
                  and never shared with third parties for advertising or training outside of CliniFlow.
                </>
              ),
            },
          ].map((row, i) => (
            <div
              key={row.n}
              className="land-inv-row reveal"
              style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
            >
              <div className="land-inv-num">{row.n}</div>
              <div className="land-inv-text">{row.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="land-footer">
        <div className="land-footer-inner">
          <div>
            <div className="land-footer-brand-title">
              Clini<em>Flow</em> AI
            </div>
            <p className="land-footer-brand-sub">
              Clinical documentation without the clerical weight. Built for primary-care clinics in Malaysia.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/login">Sign in</Link></li>
              <li><Link href="/previsit/new">Pre-visit intake</Link></li>
              <li><Link href="/portal">Patient portal</Link></li>
              <li><Link href="/doctor">Doctor workspace</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
          <div>
            <h4>How it helps</h4>
            <ul>
              <li>Shorter wait, faster visits</li>
              <li>Plain-language summaries</li>
              <li>English &amp; Bahasa Melayu</li>
              <li>Your history, remembered</li>
            </ul>
          </div>
          <div>
            <h4>Built for</h4>
            <ul>
              <li>Primary-care clinics</li>
              <li>PDPA-aware by design</li>
              <li>Hackathon · 2026</li>
              <li>Open source</li>
            </ul>
          </div>
        </div>
        <div className="land-footer-bottom">
          <span>
            <em>CliniFlow AI</em> &nbsp;·&nbsp; a hackathon submission · 2026
          </span>
          <span>docker compose up · localhost:80</span>
        </div>
      </footer>
    </main>
  );
}
