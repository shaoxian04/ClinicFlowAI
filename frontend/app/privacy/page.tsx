import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@/components/ui/Separator";
import { cn } from "@/design/cn";

export const metadata: Metadata = {
  title: "Privacy Policy — CliniFlow AI",
  description: "How CliniFlow AI collects, uses, and protects your health data under PDPA.",
};

/* ─── section wrapper ──────────────────────────────────────────────────── */
function PolicySection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-10 border-b border-hairline last:border-b-0">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-xs text-ink-soft/60 tracking-widest flex-shrink-0">
          {number}
        </span>
        <span className="text-hairline select-none flex-shrink-0" aria-hidden="true">
          ---
        </span>
        <h2 className="font-display text-xl text-ink leading-snug">{title}</h2>
      </div>
      <div className="font-sans text-sm text-ink-soft leading-relaxed flex flex-col gap-3 pl-[4.5rem]">
        {children}
      </div>
    </section>
  );
}

/* ─── body text helpers ────────────────────────────────────────────────── */
function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-none flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-mono text-oxblood/50 flex-shrink-0 mt-0.5" aria-hidden="true">
            —
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── page ─────────────────────────────────────────────────────────────── */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Top accent */}
      <div className="h-[2px] bg-oxblood w-full" aria-hidden="true" />

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-oxblood transition-colors duration-150 mb-10"
        >
          <span aria-hidden="true">←</span>
          Back home
        </Link>

        {/* Header */}
        <header className="mb-12">
          <p className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest mb-3">
            PDPA compliance · CliniFlow AI
          </p>
          <h1 className="font-display text-4xl text-ink leading-tight">
            Privacy Policy
          </h1>
        </header>

        {/* Sections */}
        <article>
          <PolicySection number="01" title="What we collect">
            <P>
              CliniFlow AI collects and processes the following personal and health
              data in the course of providing clinical workflow services:
            </P>
            <UL
              items={[
                "Consultation transcripts (voice or text) captured during your visit",
                "Health history — diagnoses, symptoms, prior consultations, and allergies",
                "Medications — prescriptions, dosages, and dispensing instructions",
                "Demographics — name, date of birth, contact details, and MyKad / passport number",
              ]}
            />
            <P>
              Data is collected only with your explicit PDPA consent and is limited
              to what is necessary for safe clinical care.
            </P>
          </PolicySection>

          <PolicySection number="02" title="How we use it">
            <UL
              items={[
                <>
                  <strong className="font-medium text-ink">Clinical documentation only</strong>{" "}
                  — your data is used exclusively to generate SOAP notes and patient-friendly
                  summaries for your treating doctor and clinic.
                </>,
                <>
                  <strong className="font-medium text-ink">AI draft, doctor reviewed</strong>{" "}
                  — AI-generated notes are always reviewed and confirmed by a qualified doctor
                  before finalisation. No clinical decision is made solely by AI.
                </>,
                <>
                  <strong className="font-medium text-ink">No third-party advertising</strong>{" "}
                  — your health data is never shared with advertisers, data brokers, or
                  marketing platforms.
                </>,
                <>
                  <strong className="font-medium text-ink">Knowledge graph</strong>{" "}
                  — anonymised health history is stored in a private knowledge base to support
                  continuity of care across visits at your registered clinic.
                </>,
              ]}
            />
          </PolicySection>

          <PolicySection number="03" title="Data retention">
            <P>
              Your health records are retained for as long as you are an active patient
              at the clinic, or as required by Malaysian health-record regulations (a
              minimum of seven years for adults). If you request deletion of your data,
              your clinic administrator will action the request within{" "}
              <strong className="font-medium text-ink">30 days</strong>.
              Certain audit logs are retained for regulatory compliance and cannot be
              deleted.
            </P>
          </PolicySection>

          <PolicySection number="04" title="Your rights under PDPA">
            <P>
              Under the Personal Data Protection Act 2010 (Malaysia), you have the
              right to:
            </P>
            <UL
              items={[
                <>
                  <strong className="font-medium text-ink">Access</strong> — request a
                  copy of the personal data we hold about you.
                </>,
                <>
                  <strong className="font-medium text-ink">Correction</strong> — request
                  that inaccurate or incomplete data be corrected.
                </>,
                <>
                  <strong className="font-medium text-ink">Withdraw consent</strong> —
                  withdraw your consent to data processing at any time. Note that
                  withdrawal may affect your ability to use the CliniFlow patient portal.
                </>,
              ]}
            />
            <P>
              To exercise any of these rights, please contact your{" "}
              <strong className="font-medium text-ink">clinic administrator</strong> directly.
              CliniFlow AI acts as a data processor on behalf of your clinic, which is the
              data controller under PDPA.
            </P>
          </PolicySection>
        </article>

        {/* Footer */}
        <Separator className="mt-0 mb-6" />
        <p className="font-sans text-xs text-ink-soft/60">
          Last updated: April 2026. For enquiries, contact your clinic admin.
        </p>
      </div>
    </div>
  );
}
