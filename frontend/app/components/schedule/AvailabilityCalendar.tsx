"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listAvailability, type Slot } from "@/lib/appointments";
import { cn } from "@/design/cn";

type Props = {
    from: string; // ISO date YYYY-MM-DD
    to: string;
    onSelect: (slot: Slot) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Two-stage booking calendar in the aurora-glass palette:
 *   1. Month-style day grid covering the [from, to] window. Past dates and
 *      days with no available slots are shown as disabled cells.
 *   2. After a day is selected, the available time slots for that day reveal
 *      below the grid. Time slots whose start is already in the past are
 *      disabled (cannot be booked).
 */
export function AvailabilityCalendar({ from, to, onSelect }: Props) {
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listAvailability(from, to)
            .then((s) => {
                if (!cancelled) setSlots(s);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load slots");
            });
        return () => {
            cancelled = true;
        };
    }, [from, to]);

    const todayKey = useMemo(() => isoDayKey(new Date()), []);
    const dayMap = useMemo(() => buildDayMap(from, to, slots ?? []), [from, to, slots]);
    const cells = useMemo(() => buildCalendarCells(from, to), [from, to]);

    if (error) {
        return (
            <p className="font-sans text-sm text-crimson" role="alert">
                {error}
            </p>
        );
    }
    if (!slots) {
        return <CalendarSkeleton />;
    }

    const selectedDaySlots = selectedDay ? dayMap.get(selectedDay) ?? [] : [];

    return (
        <div className="flex flex-col gap-6">
            {/* Calendar grid */}
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-ink-well border border-ink-rim rounded-sm p-4 sm:p-5"
            >
                {/* Weekday header */}
                <div className="grid grid-cols-7 gap-2 mb-3">
                    {WEEKDAY_LABELS.map((d) => (
                        <p
                            key={d}
                            className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest text-center"
                        >
                            {d}
                        </p>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-2">
                    {cells.map((cell, i) => {
                        if (cell.kind === "pad") {
                            return <div key={`pad-${i}`} aria-hidden className="h-16 sm:h-20" />;
                        }
                        const daySlots = dayMap.get(cell.iso) ?? [];
                        const slotCount = daySlots.length;
                        const isPast = cell.iso < todayKey;
                        const isToday = cell.iso === todayKey;
                        const disabled = isPast || slotCount === 0;
                        const isSelected = cell.iso === selectedDay;

                        return (
                            <button
                                key={cell.iso}
                                type="button"
                                disabled={disabled}
                                onClick={() => setSelectedDay(cell.iso)}
                                aria-pressed={isSelected}
                                aria-label={`${formatDayAria(cell.iso)} — ${
                                    disabled
                                        ? isPast
                                            ? "in the past"
                                            : "no available slots"
                                        : `${slotCount} slot${slotCount === 1 ? "" : "s"} available`
                                }`}
                                className={cn(
                                    "group relative h-16 sm:h-20 rounded-sm border flex flex-col items-center justify-center gap-1 transition-all",
                                    "font-display text-lg",
                                    disabled &&
                                        "border-ink-rim/40 text-fog-dim/30 cursor-not-allowed bg-transparent",
                                    !disabled &&
                                        !isSelected &&
                                        "border-ink-rim text-fog hover:border-cyan/60 hover:bg-cyan/5",
                                    isSelected &&
                                        "border-cyan/70 text-fog bg-cyan/10 ring-1 ring-cyan/40 shadow-[0_0_24px_-12px] shadow-cyan/40",
                                )}
                            >
                                <span>{cell.dayNum}</span>
                                {/* Slot-count badge / today dot */}
                                {!disabled && (
                                    <span
                                        className={cn(
                                            "font-mono text-[9px] uppercase tracking-widest",
                                            isSelected ? "text-cyan" : "text-fog-dim/60 group-hover:text-cyan/80",
                                        )}
                                    >
                                        {slotCount} slot{slotCount === 1 ? "" : "s"}
                                    </span>
                                )}
                                {disabled && isPast && (
                                    <span className="font-mono text-[9px] text-fog-dim/30 uppercase tracking-widest">
                                        past
                                    </span>
                                )}
                                {disabled && !isPast && slotCount === 0 && (
                                    <span className="font-mono text-[9px] text-fog-dim/30 uppercase tracking-widest">
                                        full
                                    </span>
                                )}
                                {/* Today indicator */}
                                {isToday && !disabled && (
                                    <span
                                        aria-hidden
                                        className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-cyan"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            {/* Slot reveal panel */}
            <AnimatePresence mode="wait">
                {selectedDay && (
                    <motion.section
                        key={selectedDay}
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <DaySlotsPanel
                            day={selectedDay}
                            slots={selectedDaySlots}
                            onSelect={onSelect}
                        />
                    </motion.section>
                )}
            </AnimatePresence>

            {!selectedDay && (
                <p className="font-sans text-sm text-fog-dim/60 text-center">
                    Select a day above to see available time slots.
                </p>
            )}
        </div>
    );
}

function DaySlotsPanel({
    day,
    slots,
    onSelect,
}: {
    day: string;
    slots: Slot[];
    onSelect: (slot: Slot) => void;
}) {
    const now = Date.now();
    const heading = formatDayHeading(day);

    return (
        <div className="bg-ink-well border border-cyan/30 rounded-sm p-4 sm:p-5">
            <div className="flex items-baseline justify-between mb-4">
                <div>
                    <p className="font-mono text-[10px] text-cyan/80 uppercase tracking-widest">
                        Available slots
                    </p>
                    <h3 className="font-display text-lg text-fog mt-1">{heading}</h3>
                </div>
                <span className="font-mono text-xs text-fog-dim/60">
                    {slots.length} slot{slots.length === 1 ? "" : "s"}
                </span>
            </div>

            {slots.length === 0 ? (
                <p className="font-sans text-sm text-fog-dim/60 py-4 text-center">
                    No availability for this day.
                </p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {slots.map((slot) => {
                        const start = new Date(slot.startAt).getTime();
                        const isPast = start <= now;
                        return (
                            <button
                                key={slot.id}
                                type="button"
                                disabled={isPast}
                                onClick={() => onSelect(slot)}
                                aria-label={
                                    isPast
                                        ? `${formatTime(slot.startAt)} — already past`
                                        : `Book ${formatTime(slot.startAt)}`
                                }
                                className={cn(
                                    "px-3 py-2 rounded-xs border font-mono text-sm tracking-wide transition-all",
                                    isPast
                                        ? "border-ink-rim/40 text-fog-dim/30 cursor-not-allowed line-through"
                                        : "border-ink-rim text-fog hover:border-cyan/70 hover:bg-cyan/10 hover:text-cyan",
                                )}
                            >
                                {formatTime(slot.startAt)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function CalendarSkeleton() {
    return (
        <div className="bg-ink-well border border-ink-rim rounded-sm p-4 sm:p-5">
            <div className="grid grid-cols-7 gap-2 mb-3">
                {WEEKDAY_LABELS.map((d) => (
                    <div key={d} className="h-3 bg-ink-rim/40 rounded-xs animate-pulse" />
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 14 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-16 sm:h-20 bg-ink-rim/20 border border-ink-rim/40 rounded-sm animate-pulse"
                    />
                ))}
            </div>
        </div>
    );
}

// ---------- helpers ----------

type CalendarCell =
    | { kind: "pad" }
    | { kind: "day"; iso: string; dayNum: number };

function buildCalendarCells(from: string, to: string): CalendarCell[] {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    // ISO weekday: Mon=1..Sun=7 — pad before so columns align Mon-first.
    const startWeekday = ((start.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
    const padBefore = startWeekday - 1;

    const cells: CalendarCell[] = [];
    for (let i = 0; i < padBefore; i++) cells.push({ kind: "pad" });

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        cells.push({ kind: "day", iso: isoDayKey(d), dayNum: d.getDate() });
    }
    // Pad to a full row
    while (cells.length % 7 !== 0) cells.push({ kind: "pad" });
    return cells;
}

function buildDayMap(from: string, to: string, slots: Slot[]): Map<string, Slot[]> {
    const days = new Map<string, Slot[]>();
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.set(isoDayKey(d), []);
    }
    for (const s of slots) {
        const key = s.startAt.slice(0, 10);
        if (!days.has(key)) days.set(key, []);
        days.get(key)!.push(s);
    }
    for (const list of days.values()) {
        list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return days;
}

function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function isoDayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function formatDayHeading(day: string): string {
    return parseLocalDate(day).toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function formatDayAria(day: string): string {
    return parseLocalDate(day).toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-MY", {
        hour: "2-digit",
        minute: "2-digit",
    });
}
