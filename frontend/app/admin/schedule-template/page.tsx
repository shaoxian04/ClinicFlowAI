"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import {
    getScheduleTemplate,
    upsertScheduleTemplate,
    type ScheduleTemplate,
} from "@/lib/appointments";

import AdminNav from "../components/AdminNav";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Day = (typeof DAYS)[number];

const SLOT_MINUTES_OPTIONS = [10, 15, 20, 30] as const;

const DEFAULT_WEEKDAY_HOURS: [string, string][] = [["09:00", "17:00"]];
const DEFAULT_WEEKEND_HOURS: [string, string][] = [];

function defaultWeeklyHours(): Record<string, [string, string][]> {
    const out: Record<string, [string, string][]> = {};
    for (const day of DAYS) {
        const isWeekend = day === "SAT" || day === "SUN";
        out[day] = isWeekend ? [] : [...DEFAULT_WEEKDAY_HOURS];
    }
    return out;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

type FormState = {
    effectiveFrom: string;
    slotMinutes: number;
    cancelLeadHours: number;
    generationHorizonDays: number;
    weeklyHours: Record<string, [string, string][]>;
};

function defaultFormState(): FormState {
    return {
        effectiveFrom: todayIso(),
        slotMinutes: 15,
        cancelLeadHours: 2,
        generationHorizonDays: 28,
        weeklyHours: defaultWeeklyHours(),
    };
}

function templateToForm(t: ScheduleTemplate): FormState {
    return {
        effectiveFrom: t.effectiveFrom,
        slotMinutes: t.slotMinutes,
        cancelLeadHours: t.cancelLeadHours,
        generationHorizonDays: t.generationHorizonDays,
        weeklyHours: t.weeklyHours,
    };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type WindowPairProps = {
    pair: [string, string];
    onChangeStart: (v: string) => void;
    onChangeEnd: (v: string) => void;
    onRemove: () => void;
};

function WindowPair({ pair, onChangeStart, onChangeEnd, onRemove }: WindowPairProps) {
    return (
        <div className="sched-window-pair">
            <input
                type="time"
                className="input input-compact"
                value={pair[0]}
                onChange={(e) => onChangeStart(e.target.value)}
                aria-label="Window start"
            />
            <span className="sched-window-sep">–</span>
            <input
                type="time"
                className="input input-compact"
                value={pair[1]}
                onChange={(e) => onChangeEnd(e.target.value)}
                aria-label="Window end"
            />
            <button
                type="button"
                className="sched-window-remove"
                onClick={onRemove}
                aria-label="Remove window"
            >
                ×
            </button>
        </div>
    );
}

type DayRowProps = {
    day: Day;
    pairs: [string, string][];
    onAdd: () => void;
    onChangeStart: (idx: number, v: string) => void;
    onChangeEnd: (idx: number, v: string) => void;
    onRemove: (idx: number) => void;
};

function DayRow({ day, pairs, onAdd, onChangeStart, onChangeEnd, onRemove }: DayRowProps) {
    return (
        <div className="sched-day-row">
            <span className="sched-day-label">{day}</span>
            <div className="sched-day-windows">
                {pairs.length === 0 && (
                    <span className="sched-day-closed">Closed</span>
                )}
                {pairs.map((pair, idx) => (
                    <WindowPair
                        key={idx}
                        pair={pair}
                        onChangeStart={(v) => onChangeStart(idx, v)}
                        onChangeEnd={(v) => onChangeEnd(idx, v)}
                        onRemove={() => onRemove(idx)}
                    />
                ))}
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onAdd}
                >
                    + Add window
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminScheduleTemplatePage() {
    const router = useRouter();

    const [form, setForm] = useState<FormState>(defaultFormState);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Auth guard.
    useEffect(() => {
        const user = getUser();
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "ADMIN") { router.replace("/login"); }
    }, [router]);

    // Load on mount.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const tmpl = await getScheduleTemplate();
                if (!cancelled) {
                    setForm(tmpl ? templateToForm(tmpl) : defaultFormState());
                }
            } catch (err) {
                if (!cancelled) {
                    setLoadError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ---------------------------------------------------------------------------
    // Form helpers (immutable updates)
    // ---------------------------------------------------------------------------

    function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function addWindow(day: string) {
        setForm((prev) => ({
            ...prev,
            weeklyHours: {
                ...prev.weeklyHours,
                [day]: [...(prev.weeklyHours[day] ?? []), ["09:00", "17:00"]],
            },
        }));
    }

    function removeWindow(day: string, idx: number) {
        setForm((prev) => {
            const pairs = prev.weeklyHours[day] ?? [];
            return {
                ...prev,
                weeklyHours: {
                    ...prev.weeklyHours,
                    [day]: pairs.filter((_, i) => i !== idx),
                },
            };
        });
    }

    function setWindowStart(day: string, idx: number, value: string) {
        setForm((prev) => {
            const pairs = prev.weeklyHours[day] ?? [];
            const updated = pairs.map((p, i): [string, string] =>
                i === idx ? [value, p[1]] : p
            );
            return {
                ...prev,
                weeklyHours: { ...prev.weeklyHours, [day]: updated },
            };
        });
    }

    function setWindowEnd(day: string, idx: number, value: string) {
        setForm((prev) => {
            const pairs = prev.weeklyHours[day] ?? [];
            const updated = pairs.map((p, i): [string, string] =>
                i === idx ? [p[0], value] : p
            );
            return {
                ...prev,
                weeklyHours: { ...prev.weeklyHours, [day]: updated },
            };
        });
    }

    // ---------------------------------------------------------------------------
    // Save
    // ---------------------------------------------------------------------------

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            const result = await upsertScheduleTemplate({
                effectiveFrom: form.effectiveFrom,
                slotMinutes: form.slotMinutes,
                weeklyHours: form.weeklyHours,
                cancelLeadHours: form.cancelLeadHours,
                generationHorizonDays: form.generationHorizonDays,
            });
            setForm(templateToForm(result));
            setSaveSuccess(true);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <>
            <AdminNav active="schedule-template" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Schedule template.</h1>
                    <p className="page-header-sub">
                        Define the clinic&apos;s recurring weekly hours and slot configuration.
                    </p>
                </header>

                <div className="ghost-banner" role="note">
                    Saving will regenerate AVAILABLE slots for the next 28 days. BOOKED slots
                    are kept untouched.
                </div>

                {loadError && (
                    <div className="banner banner-error" role="alert">
                        {loadError}
                    </div>
                )}

                {loading ? (
                    <SkeletonForm />
                ) : (
                    <form onSubmit={handleSave} className="sched-template-form">
                        {/* Effective from */}
                        <label className="field">
                            <span className="field-label">Effective from</span>
                            <input
                                type="date"
                                className="input"
                                value={form.effectiveFrom}
                                onChange={(e) => setField("effectiveFrom", e.target.value)}
                                required
                            />
                        </label>

                        {/* Slot minutes */}
                        <label className="field">
                            <span className="field-label">Slot duration (minutes)</span>
                            <select
                                className="input"
                                value={form.slotMinutes}
                                onChange={(e) =>
                                    setField("slotMinutes", Number(e.target.value))
                                }
                            >
                                {SLOT_MINUTES_OPTIONS.map((m) => (
                                    <option key={m} value={m}>
                                        {m} min
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Cancel lead hours */}
                        <label className="field">
                            <span className="field-label">
                                Cancellation lead time (hours)
                            </span>
                            <input
                                type="number"
                                className="input"
                                value={form.cancelLeadHours}
                                min={0}
                                max={168}
                                onChange={(e) =>
                                    setField("cancelLeadHours", Number(e.target.value))
                                }
                                required
                            />
                        </label>

                        {/* Horizon days */}
                        <label className="field">
                            <span className="field-label">
                                Slot generation horizon (days)
                            </span>
                            <input
                                type="number"
                                className="input"
                                value={form.generationHorizonDays}
                                min={1}
                                max={90}
                                onChange={(e) =>
                                    setField("generationHorizonDays", Number(e.target.value))
                                }
                                required
                            />
                        </label>

                        {/* Weekly hours editor */}
                        <div className="field">
                            <span className="field-label">Weekly hours</span>
                            <div className="sched-weekly-editor">
                                {DAYS.map((day) => (
                                    <DayRow
                                        key={day}
                                        day={day}
                                        pairs={form.weeklyHours[day] ?? []}
                                        onAdd={() => addWindow(day)}
                                        onChangeStart={(idx, v) => setWindowStart(day, idx, v)}
                                        onChangeEnd={(idx, v) => setWindowEnd(day, idx, v)}
                                        onRemove={(idx) => removeWindow(day, idx)}
                                    />
                                ))}
                            </div>
                        </div>

                        {saveError && (
                            <div className="banner banner-error" role="alert">
                                {saveError}
                            </div>
                        )}

                        {saveSuccess && (
                            <div className="banner banner-success" role="status">
                                Template saved. Slot regeneration is underway.
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Save template"}
                        </button>
                    </form>
                )}
            </main>
        </>
    );
}

function SkeletonForm() {
    return (
        <div className="sched-template-form" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="field">
                    <span className="skeleton-bar skeleton-bar-narrow" />
                    <span className="skeleton-bar skeleton-bar-wide" style={{ marginTop: 4 }} />
                </div>
            ))}
        </div>
    );
}
