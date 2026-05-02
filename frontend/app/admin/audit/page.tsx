"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAuditLog, type AuditEntry, type AuditPage } from "@/lib/admin";
import AdminNav from "../components/AdminNav";

const ACTIONS = ["", "READ", "CREATE", "UPDATE", "DELETE", "LOGIN", "EXPORT"];
const LIMIT = 50;

const ACTION_COLOR: Record<string, string> = {
    READ:   "text-fog-dim",
    CREATE: "text-cyan",
    UPDATE: "text-amber",
    DELETE: "text-crimson",
    LOGIN:  "text-lime",
    EXPORT: "text-violet",
};

function ActionBadge({ action }: { action: string }) {
    return (
        <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${ACTION_COLOR[action] ?? "text-fog-dim"}`}>
            {action}
        </span>
    );
}

function fmtTime(iso: string) {
    try {
        return new Date(iso).toLocaleString("en-MY", {
            month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false,
        });
    } catch { return iso; }
}

function truncate(s: string | null | undefined, n: number) {
    if (!s) return "—";
    return s.length > n ? s.slice(0, n) + "…" : s;
}

function metaSummary(meta: Record<string, unknown>) {
    const keys = Object.keys(meta);
    if (keys.length === 0) return "—";
    return keys.slice(0, 2).map(k => `${k}=${JSON.stringify(meta[k])}`).join(", ")
        + (keys.length > 2 ? " …" : "");
}

export default function AdminAuditPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AuditPage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [filterAction, setFilterAction] = useState("");
    const [filterResourceType, setFilterResourceType] = useState("");
    const [filterFrom, setFilterFrom] = useState("");
    const [filterTo, setFilterTo] = useState("");
    const [applied, setApplied] = useState(0);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "ADMIN") { router.replace("/login"); return; }
    }, [router]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getAuditLog({
            page, limit: LIMIT,
            action: filterAction || undefined,
            resourceType: filterResourceType || undefined,
            from: filterFrom || undefined,
            to: filterTo || undefined,
        }).then(d => {
            if (!cancelled) { setData(d); setLoading(false); }
        }).catch(err => {
            if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); }
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, applied]);

    function applyFilters() { setPage(0); setApplied(n => n + 1); }

    const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

    return (
        <>
            <AdminNav active="audit" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Audit log.</h1>
                    <p className="page-header-sub">
                        PDPA-compliant append-only record of all create, update, delete and login events.
                    </p>
                </header>

                <div className="audit-filters">
                    <div className="audit-filter-field field">
                        <label className="field-label">Action</label>
                        <select className="input" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                            {ACTIONS.map(a => <option key={a} value={a}>{a || "All"}</option>)}
                        </select>
                    </div>
                    <div className="audit-filter-field field">
                        <label className="field-label">Resource type</label>
                        <input className="input" placeholder="e.g. USER" value={filterResourceType}
                            onChange={e => setFilterResourceType(e.target.value.toUpperCase())} />
                    </div>
                    <div className="audit-filter-field field">
                        <label className="field-label">From</label>
                        <input className="input" type="date" value={filterFrom}
                            onChange={e => setFilterFrom(e.target.value)} />
                    </div>
                    <div className="audit-filter-field field">
                        <label className="field-label">To</label>
                        <input className="input" type="date" value={filterTo}
                            onChange={e => setFilterTo(e.target.value)} />
                    </div>
                    <div className="audit-filter-btn">
                        <button type="button" className="btn btn-primary" onClick={applyFilters}>Apply</button>
                    </div>
                </div>

                {error && <div className="banner banner-error mt-4">{error}</div>}

                {loading ? (
                    <SkeletonAudit />
                ) : data && data.entries.length > 0 ? (
                    <>
                        <div className="admin-table-wrap">
                            <table className="audit-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Actor</th>
                                        <th>Action</th>
                                        <th>Resource</th>
                                        <th>ID</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map((e: AuditEntry) => (
                                        <tr key={e.id}>
                                            <td className="font-mono text-xs whitespace-nowrap">{fmtTime(e.occurred_at)}</td>
                                            <td className="text-sm">{e.actor_name ?? e.actor_email ?? "System"}</td>
                                            <td><ActionBadge action={e.action} /></td>
                                            <td className="font-mono text-xs">{e.resource_type}</td>
                                            <td className="font-mono text-xs">{truncate(e.resource_id, 20)}</td>
                                            <td className="font-mono text-xs text-fog-dim max-w-xs truncate">{metaSummary(e.metadata)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="audit-pagination">
                            <button type="button" className="btn btn-sm"
                                onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                                ← Prev
                            </button>
                            <span className="audit-page-info">
                                Page {page + 1} of {totalPages} · {data.total.toLocaleString()} entries
                            </span>
                            <button type="button" className="btn btn-sm"
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                                Next →
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="empty-state mt-6">
                        <div className="empty-state-title">No audit entries.</div>
                        <div className="empty-state-body">Adjust filters or wait for activity.</div>
                    </div>
                )}
            </main>
        </>
    );
}

function SkeletonAudit() {
    return (
        <div className="admin-table-wrap mt-6" aria-busy="true">
            <table className="audit-table">
                <thead>
                    <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>ID</th><th>Details</th></tr>
                </thead>
                <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                            {Array.from({ length: 6 }).map((__, j) => (
                                <td key={j}><span className="skeleton-bar skeleton-bar-wide" /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
