"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

import StaffNav from "../../components/StaffNav";

type VisitRecord = {
    visitId: string;
    finalizedAt: string;
    summaryEnPreview: string;
};

type PatientRecord = {
    id: string;
    name: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    visits: VisitRecord[];
};

export default function StaffPatientDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [loading, setLoading] = useState<boolean>(true);
    const [patient, setPatient] = useState<PatientRecord | null>(null);
    const [notFound, setNotFound] = useState<boolean>(false);

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "STAFF") {
            router.replace("/login");
            return;
        }
        if (!id) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await apiGet<PatientRecord>(`/patients/${encodeURIComponent(id)}`);
                if (!cancelled) setPatient(data);
            } catch (err) {
                if (!cancelled) {
                    setNotFound(true);
                    setPatient(null);
                }
                console.warn("patient detail unavailable", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router, id]);

    return (
        <>
            <StaffNav active="patients" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Patients</div>
                    <h1 className="page-header-title">Patient file.</h1>
                    <p className="page-header-sub">
                        Read-only view of demographics and past visits.
                    </p>
                </header>

                {loading ? (
                    <div className="staff-card" aria-busy="true">
                        <div className="skeleton-bar skeleton-bar-wide" />
                        <div className="skeleton-bar skeleton-bar-narrow" />
                    </div>
                ) : notFound || !patient ? (
                    <EmptyState
                        title="Patient not found."
                        body="The record may have been removed, or the link is incorrect."
                    />
                ) : (
                    <>
                        <section className="staff-card">
                            <h2 className="staff-card-title">Demographics</h2>
                            <dl className="staff-dl">
                                <dt>Name</dt>
                                <dd>{patient.name || "—"}</dd>
                                <dt>Date of birth</dt>
                                <dd>{formatDob(patient.dateOfBirth)}</dd>
                                <dt>Email</dt>
                                <dd>{patient.email || "—"}</dd>
                                <dt>Phone</dt>
                                <dd>{patient.phone || "—"}</dd>
                            </dl>
                        </section>

                        <section className="staff-card">
                            <h2 className="staff-card-title">Visits</h2>
                            {patient.visits && patient.visits.length > 0 ? (
                                <ul className="visit-list">
                                    {patient.visits.map((v) => (
                                        <li key={v.visitId} className="visit-item">
                                            <div className="visit-item-date">
                                                {formatDateTime(v.finalizedAt)}
                                            </div>
                                            <div className="visit-item-preview">
                                                {v.summaryEnPreview || "No summary available."}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="staff-card-empty">
                                    No past visits on record.
                                </p>
                            )}
                        </section>

                        <p className="readonly-caption">
                            Read-only. Clinical records are edited by doctors.
                        </p>
                    </>
                )}
            </main>
        </>
    );
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="empty-state">
            <div className="empty-state-glyph" aria-hidden="true">
                <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
            </div>
            <div className="empty-state-title">{title}</div>
            <div className="empty-state-body">{body}</div>
        </div>
    );
}

function formatDob(iso: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
}

function formatDateTime(iso: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
}
