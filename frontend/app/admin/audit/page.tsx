"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { getUser, getToken } from "@/lib/auth";

import AdminNav from "../components/AdminNav";

type AuditEntry = {
    id: string;
    timestamp: string;
    userEmail: string;
    action: string;
    resourceId: string;
};

type AuditResponse = {
    entries: AuditEntry[];
    totalPages: number;
    currentPage: number;
};

type Filters = {
    user: string;
    action: string;
    dateFrom: string;
    dateTo: string;
};

const EMPTY_FILTERS: Filters = { user: "", action: "", dateFrom: "", dateTo: "" };

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

async function fetchAudit(
    page: number,
    filters: Filters,
): Promise<AuditResponse> {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (filters.user) params.set("user", filters.user);
    if (filters.action) params.set("action", filters.action);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);

    const res = await fetch(`${BASE}/admin/audit?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    type Envelope = {
        code: number;
        message: string;
        data: AuditResponse | null;
    };
    const envelope: Envelope = await res.json();
    if (envelope.code !== 0) throw new Error(envelope.message || `code ${envelope.code}`);
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}

export default function AdminAuditPage() {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(true);
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [stub, setStub] = useState<boolean>(false);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [pendingFilters, setPendingFilters] = useState<Filters>(EMPTY_FILTERS);

    const loadPage = useCallback(
        async (page: number, activeFilters: Filters) => {
            setLoading(true);
            setStub(false);
            try {
                const data = await fetchAudit(page, activeFilters);
                setEntries(data.entries ?? []);
                setTotalPages(data.totalPages ?? 1);
                setCurrentPage(data.currentPage ?? page);
            } catch (err) {
                setStub(true);
                setEntries([]);
                setTotalPages(1);
                setCurrentPage(0);
                console.warn("admin/audit unavailable", err);
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "ADMIN") {
            router.replace("/login");
            return;
        }
        loadPage(0, EMPTY_FILTERS);
    }, [router, loadPage]);

    function onFilterChange(field: keyof Filters, value: string) {
        setPendingFilters((prev) => ({ ...prev, [field]: value }));
    }

    function onApplyFilters(e: React.FormEvent) {
        e.preventDefault();
        setFilters(pendingFilters);
        loadPage(0, pendingFilters);
    }

    function onPrev() {
        if (currentPage > 0) {
            loadPage(currentPage - 1, filters);
        }
    }

    function onNext() {
        if (currentPage < totalPages - 1) {
            loadPage(currentPage + 1, filters);
        }
    }

    return (
        <>
            <AdminNav active="audit" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Audit log.</h1>
                    <p className="page-header-sub">
                        PDPA-compliant append-only record of all actions. Read-only — no edits or
                        deletions permitted.
                    </p>
                </header>

                {stub && (
                    <div className="ghost-banner" role="status">
                        Stub — backend pending. Showing empty log until the API is wired up.
                    </div>
                )}

                <form onSubmit={onApplyFilters} className="audit-filters">
                    <label className="field audit-filter-field">
                        <span className="field-label">User email</span>
                        <input
                            type="text"
                            className="input"
                            placeholder="Filter by user…"
                            value={pendingFilters.user}
                            onChange={(e) => onFilterChange("user", e.target.value)}
                        />
                    </label>
                    <label className="field audit-filter-field">
                        <span className="field-label">Action</span>
                        <input
                            type="text"
                            className="input"
                            placeholder="Filter by action…"
                            value={pendingFilters.action}
                            onChange={(e) => onFilterChange("action", e.target.value)}
                        />
                    </label>
                    <label className="field audit-filter-field">
                        <span className="field-label">From</span>
                        <input
                            type="date"
                            className="input"
                            value={pendingFilters.dateFrom}
                            onChange={(e) => onFilterChange("dateFrom", e.target.value)}
                        />
                    </label>
                    <label className="field audit-filter-field">
                        <span className="field-label">To</span>
                        <input
                            type="date"
                            className="input"
                            value={pendingFilters.dateTo}
                            onChange={(e) => onFilterChange("dateTo", e.target.value)}
                        />
                    </label>
                    <button type="submit" className="btn btn-primary audit-filter-btn">
                        Apply filters
                    </button>
                </form>

                {loading ? (
                    <AuditSkeleton />
                ) : entries.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-title">No audit entries found.</div>
                        <div className="empty-state-body">
                            Try adjusting your filters or check back after some activity has been
                            recorded.
                        </div>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="audit-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Resource ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{formatTimestamp(entry.timestamp)}</td>
                                        <td>{entry.userEmail}</td>
                                        <td>{entry.action}</td>
                                        <td>
                                            <code>{entry.resourceId}</code>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="audit-pagination">
                    <button
                        type="button"
                        className="btn"
                        disabled={currentPage <= 0 || loading}
                        onClick={onPrev}
                    >
                        ← Prev
                    </button>
                    <span className="audit-page-info">
                        Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn"
                        disabled={currentPage >= totalPages - 1 || loading}
                        onClick={onNext}
                    >
                        Next →
                    </button>
                </div>
            </main>
        </>
    );
}

function AuditSkeleton() {
    return (
        <div className="admin-table-wrap" aria-busy="true">
            <table className="audit-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Resource ID</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                            <td>
                                <span className="skeleton-bar skeleton-bar-narrow" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-wide" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-narrow" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-narrow" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString([], {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "—";
    }
}
