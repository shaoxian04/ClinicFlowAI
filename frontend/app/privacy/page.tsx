import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CliniFlow AI",
  description: "How CliniFlow AI collects, uses, and protects your health data under PDPA.",
};

export default function PrivacyPage() {
  return (
    <div className="landing">
      <div className="land-section" style={{ maxWidth: 760 }}>
        <Link href="/" className="back-to-home" style={{ marginBottom: 32, display: "inline-flex" }}>
          ← Back home
        </Link>

        <span className="eyebrow" style={{ marginBottom: 12, display: "block" }}>
          PDPA compliance · CliniFlow AI
        </span>
        <h1
          className="land-section-title"
          style={{ maxWidth: "none", marginBottom: 48 }}
        >
          Privacy Policy
        </h1>

        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeadStyle}>What we collect</h2>
          <p style={bodyStyle}>
            CliniFlow AI collects and processes the following personal and health
            data in the course of providing clinical workflow services:
          </p>
          <ul style={listStyle}>
            <li>Consultation transcripts (voice or text) captured during your visit</li>
            <li>Health history — diagnoses, symptoms, prior consultations, and allergies</li>
            <li>Medications — prescriptions, dosages, and dispensing instructions</li>
            <li>Demographics — name, date of birth, contact details, and MyKad / passport number</li>
          </ul>
          <p style={bodyStyle}>
            Data is collected only with your explicit PDPA consent and is limited
            to what is necessary for safe clinical care.
          </p>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeadStyle}>How we use it</h2>
          <ul style={listStyle}>
            <li>
              <strong>Clinical documentation only</strong> — your data is used
              exclusively to generate SOAP notes and patient-friendly summaries for
              your treating doctor and clinic.
            </li>
            <li>
              <strong>AI draft, doctor reviewed</strong> — AI-generated notes are
              always reviewed and confirmed by a qualified doctor before finalisation.
              No clinical decision is made solely by AI.
            </li>
            <li>
              <strong>No third-party advertising</strong> — your health data is
              never shared with advertisers, data brokers, or marketing platforms.
            </li>
            <li>
              <strong>Knowledge graph</strong> — anonymised health history is stored
              in a private knowledge base to support continuity of care across visits
              at your registered clinic.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeadStyle}>Data retention</h2>
          <p style={bodyStyle}>
            Your health records are retained for as long as you are an active patient
            at the clinic, or as required by Malaysian health-record regulations (a
            minimum of seven years for adults). If you request deletion of your data,
            your clinic administrator will action the request within <strong>30 days</strong>.
            Certain audit logs are retained for regulatory compliance and cannot be
            deleted.
          </p>
        </section>

        <section style={{ marginBottom: 64 }}>
          <h2 style={sectionHeadStyle}>Your rights under PDPA</h2>
          <p style={bodyStyle}>
            Under the Personal Data Protection Act 2010 (Malaysia), you have the
            right to:
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Access</strong> — request a copy of the personal data we hold
              about you.
            </li>
            <li>
              <strong>Correction</strong> — request that inaccurate or incomplete
              data be corrected.
            </li>
            <li>
              <strong>Withdraw consent</strong> — withdraw your consent to data
              processing at any time. Note that withdrawal may affect your ability
              to use the CliniFlow patient portal.
            </li>
          </ul>
          <p style={bodyStyle}>
            To exercise any of these rights, please contact your{" "}
            <strong>clinic administrator</strong> directly. CliniFlow AI acts as a
            data processor on behalf of your clinic, which is the data controller
            under PDPA.
          </p>
        </section>

        <div
          style={{
            borderTop: "1px solid var(--line)",
            paddingTop: 24,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          Last updated: April 2026. For enquiries, contact your clinic admin.
        </div>
      </div>
    </div>
  );
}

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 380,
  fontSize: 22,
  letterSpacing: "-0.015em",
  marginBottom: 12,
  color: "var(--ink)",
};

const bodyStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: "var(--ink-2)",
  marginBottom: 12,
};

const listStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: "var(--ink-2)",
  paddingLeft: 24,
  marginBottom: 12,
};
