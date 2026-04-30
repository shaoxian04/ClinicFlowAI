"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren, auroraPulse } from "@/design/motion";
import { HeroFlow } from "@/components/illustrations/HeroFlow";
import { ProcessDiagram } from "@/components/illustrations/ProcessDiagram";

/* ─── scroll-progress bar ─────────────────────────────────────────────── */
function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[2px] bg-cyan origin-left z-[60]"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}

/* ─── section label ────────────────────────────────────────────────────── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

/* ─── feature lines ────────────────────────────────────────────────────── */
const FEATURES = [
  {
    number: "01",
    title: "Before the visit",
    desc: "A guided intake chat captures symptoms, duration, and current medications. Your doctor walks in already briefed.",
  },
  {
    number: "02",
    title: "During the visit",
    desc: "The AI drafts the SOAP note while your doctor speaks to you. Every word is reviewed and signed before it becomes a record.",
  },
  {
    number: "03",
    title: "After the visit",
    desc: "A plain-language summary — in English and Bahasa Melayu — lands in your portal with medication instructions written for people, not charts.",
  },
] as const;

/* ─── differentiators ─────────────────────────────────────────────────── */
const DIFFERENTIATORS = [
  {
    label: "Remembers you",
    heading: "Your doctor walks in already knowing your history.",
    body: "Past symptoms, diagnoses, medications, and allergies travel with you across visits — so you never repeat your story.",
  },
  {
    label: "Learns the wording, not the decisions",
    heading: "The AI picks up your doctor's style — never their judgment.",
    body: "Notes sound like your doctor over time. But prescriptions, diagnoses, and red-flag thresholds always come from a human.",
  },
] as const;

/* ─── safety invariants ────────────────────────────────────────────────── */
const INVARIANTS = [
  {
    n: "I",
    text: (
      <>
        <strong>A doctor always signs off</strong> before your note is final. You&apos;ll
        clearly see when you&apos;re looking at an AI draft versus a doctor-confirmed record.
      </>
    ),
  },
  {
    n: "II",
    text: (
      <>
        The AI can learn how your doctor <strong>writes</strong> — but never what to
        prescribe, what to diagnose, or when to raise an alarm.
      </>
    ),
  },
  {
    n: "III",
    text: (
      <>
        Your medical history is <strong>kept intact</strong>. No entry can be quietly
        deleted or rewritten. A clear trail exists for every change.
      </>
    ),
  },
  {
    n: "IV",
    text: (
      <>
        Your data is <strong>handled under PDPA</strong>, stored in Malaysia-friendly
        infrastructure, and never shared with third parties for advertising or training.
      </>
    ),
  },
] as const;

/* ─── page ─────────────────────────────────────────────────────────────── */
export default function Home() {
  const mainRef = useRef<HTMLDivElement>(null);

  return (
    <main ref={mainRef} className="bg-obsidian text-fog font-sans min-h-screen">
      <ScrollProgressBar />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left column — content */}
          <motion.div
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="flex flex-col"
          >
            <motion.div variants={fadeUp}>
              <Eyebrow>CliniFlow AI · For Malaysian clinics</Eyebrow>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-display text-4xl md:text-5xl text-fog leading-[1.08] tracking-tight mt-2"
            >
              More minutes with your doctor.{" "}
              <em className="not-italic bg-gradient-aurora bg-clip-text text-transparent">Fewer on paperwork.</em>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-lg text-fog-dim font-sans leading-relaxed mt-6"
            >
              CliniFlow helps your clinic run a calmer visit — capturing the
              conversation so your doctor can focus on you, then sending you home
              with a clear bilingual summary.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex items-center gap-4 mt-8 flex-wrap"
            >
              <motion.div
                variants={auroraPulse}
                initial="initial"
                animate="animate"
                className="rounded-sm"
              >
                <Button asChild size="lg" variant="primary">
                  <Link href="/auth/register">Create patient account</Link>
                </Button>
              </motion.div>
              <Button asChild size="lg" variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#flow">See how it works</a>
              </Button>
            </motion.div>

            <motion.div variants={fadeUp} className="flex gap-3 mt-6 flex-wrap">
              <div className="bg-ink-well/30 backdrop-blur-md border border-ink-rim/40 rounded-sm px-4 py-3 flex gap-3 flex-wrap">
                {["Private by design", "Doctor-reviewed", "Bilingual summaries"].map(
                  (label) => (
                    <span
                      key={label}
                      className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest"
                    >
                      {label}
                    </span>
                  )
                )}
              </div>
            </motion.div>
          </motion.div>

          {/* Right column — illustration */}
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="hidden md:flex items-center justify-center"
          >
            <HeroFlow className="w-full max-w-[400px] mx-auto h-auto" />
          </motion.div>
        </div>
      </section>

      {/* ── HOW A VISIT WORKS ─────────────────────────────────────────── */}
      <section id="flow" className="border-t border-ink-rim">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <Eyebrow>How a visit works</Eyebrow>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="font-display text-3xl md:text-4xl text-fog leading-tight mb-12"
          >
            From the first symptom to a summary you can actually read.
          </motion.h2>

          <ProcessDiagram className="mb-12" />

          <motion.div
            variants={staggerChildren}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="flex flex-col gap-0"
          >
            {FEATURES.map((f, i) => (
              <motion.article
                key={f.number}
                variants={fadeUp}
                className={cn(
                  "py-8 flex gap-6",
                  i < FEATURES.length - 1 && "border-b border-ink-rim"
                )}
              >
                <div className="flex-shrink-0 font-mono text-xs text-fog-dim/60 tracking-widest w-6 pt-0.5">
                  {f.number}
                </div>
                <div>
                  <h3 className="font-sans font-medium text-base text-fog mb-2">
                    {f.title}
                  </h3>
                  <p className="font-sans text-sm text-fog-dim leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── WHAT MAKES IT DIFFERENT ───────────────────────────────────── */}
      <section className="bg-ink-well border-t border-b border-ink-rim">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <Eyebrow>What makes it different</Eyebrow>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="font-display text-3xl text-fog leading-tight mb-12"
          >
            Two ideas that change how your visit feels.
          </motion.h2>

          <motion.div
            variants={staggerChildren}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-10"
          >
            {DIFFERENTIATORS.map((d) => (
              <motion.div key={d.label} variants={fadeUp}>
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                  {d.label}
                </p>
                <h3 className="font-display text-xl text-fog leading-snug mb-3">
                  {d.heading}
                </h3>
                <p className="font-sans text-sm text-fog-dim leading-relaxed">
                  {d.body}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── OUR PROMISES ─────────────────────────────────────────────── */}
      <section className="border-t border-ink-rim">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <Eyebrow>Our promises to you</Eyebrow>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="font-display text-3xl text-fog leading-tight mb-12"
          >
            Four lines we will <em className="not-italic text-cyan">never</em> cross.
          </motion.h2>

          <motion.div
            variants={staggerChildren}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="flex flex-col gap-0"
          >
            {INVARIANTS.map((inv, i) => (
              <motion.div
                key={inv.n}
                variants={fadeUp}
                className={cn(
                  "flex gap-6 py-6",
                  i < INVARIANTS.length - 1 && "border-b border-ink-rim"
                )}
              >
                <div className="flex-shrink-0 font-mono text-xs text-cyan/60 tracking-widest w-6 pt-0.5">
                  {inv.n}
                </div>
                <p className="font-sans text-sm text-fog-dim leading-relaxed">
                  {inv.text}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-ink-rim bg-ink-well">
        <div className="max-w-2xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <p className="font-display text-xl text-fog mb-2">CliniFlow</p>
              <p className="font-sans text-sm text-fog-dim leading-relaxed">
                Clinical documentation without the clerical weight. Built for
                primary-care clinics in Malaysia.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Product
              </p>
              <ul className="flex flex-col gap-2">
                {[
                  { href: "/auth/register", label: "Create patient account" },
                  { href: "/login", label: "Sign in" },
                  { href: "/previsit/new", label: "Pre-visit intake" },
                  { href: "/portal", label: "Patient portal" },
                  { href: "/doctor", label: "Doctor workspace" },
                  { href: "/privacy", label: "Privacy policy" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-sans text-sm text-fog-dim hover:text-cyan transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Built for */}
            <div>
              <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Built for
              </p>
              <ul className="flex flex-col gap-2">
                {[
                  "Primary-care clinics",
                  "PDPA-aware by design",
                  "English & Bahasa Melayu",
                  "Hackathon · 2026",
                ].map((item) => (
                  <li key={item} className="font-sans text-sm text-fog-dim">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Separator className="my-0" />

          <div className="flex items-center justify-between mt-6 gap-4 flex-wrap">
            <span className="font-sans text-xs text-fog-dim/60">
              CliniFlow AI · A hackathon submission · 2026
            </span>
            <Link
              href="/privacy"
              className="font-sans text-xs text-fog-dim/60 hover:text-cyan transition-colors duration-150"
            >
              Privacy policy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
