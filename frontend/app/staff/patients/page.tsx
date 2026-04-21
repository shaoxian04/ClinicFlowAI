"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

import StaffNav from "../components/StaffNav";

type Patient = {
    id: string;
    name: string;
    email: string;
    phone: string;
    dateOfBirth: string;
};

type PatientsResponse = { patients: Patient[] };

export default function StaffPatientsPage() {
    const router = useRouter();
    const [query, setQuery] = useState<string>("");
    const [debounced, setDebounced] = useState<string>("");
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [dataUnavailable, setDataUnavailable] = useState<boolean>(false);

    // Auth guard.
    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "STAFF") {
            router.replace("/login");
        }
    }, [router]);

    // Debounce query input by 250ms.
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query), 250);
        return () => clearTimeout(t);
    }, [query]);

    // Fetch on debounced-query change.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setDataUnavailable(false);
        (async () => {
            try {
                const path = `/patients?q=${encodeURIComponent(debounced)}`;
                const data = await apiGet<PatientsResponse>(path);
                if (!cancelled) {
                    setPatients(data.patients ?? []);
                }
            } catch (err) {
                if (!cancelled) {
                    setDataUnavailable(true);
                    setPatients([]);
                }
                console.warn("patients search unavailable", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debounced]);

    return (
        <>
            <StaffNav active="patients" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Directory</div>
                    <h1 className="page-header-title">Patients.</h1>
                    <p className="page-header-sub">
                        Find a patient by name or email. Read-only — clinical records are
                        edited by doctors.
                    </p>
                </header>

                <div className="staff-search">
                    <input
                        className="input"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or email"
                        aria-label="Search patients"
                    />
                </div>

                {dataUnavailable && (
                    <div className="ghost-banner" role="status">
                        Data unavailable — patient directory is offline until the backend is
                        wired up.
                    </div>
                )}

                {loading ? (
                    <SkeletonPatientRows count={3} />
                ) : patients.length === 0 ? (
                    <EmptyState
                        title="No patients match."
                        body={
                            debounced
                                ? "Try a different name or email."
                                : "When patients are registered, they'll show up here."
                        }
                    />
                ) : (
                    <div className="patient-list">
                        {patients.map((p) => (
                            <Link
                                key={p.id}
                                href={`/staff/patients/${p.id}`}
                                className="patient-row"
                            >
                                <div>
                                    <div className="patient-name">{p.name}</div>
                                    <div className="patient-meta">
                                        {formatDobAge(p.dateOfBirth)}
                                    </div>
                                </div>
                                <div className="patient-meta patient-meta-right">
                                    {p.email}
                                    {p.phone ? ` · ${p.phone}` : ""}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </>
    );
}

function SkeletonPatientRows({ count }: { count: number }) {
    return (
        <div className="patient-list" aria-busy="true">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="patient-row skeleton-row">
                    <div>
                        <div className="skeleton-bar skeleton-bar-wide" />
                        <div className="skeleton-bar skeleton-bar-narrow" />
                    </div>
                    <div className="skeleton-bar skeleton-bar-wide" />
                </div>
            ))}
        </div>
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
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                </svg>
            </div>
            <div className="empty-state-title">{title}</div>
            <div className="empty-state-body">{body}</div>
        </div>
    );
}

function formatDobAge(dob: string): string {
    if (!dob) return "DOB unknown";
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return "DOB unknown";
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
        age -= 1;
    }
    return `${d.toLocaleDateString()} · ${age} yr`;
}
