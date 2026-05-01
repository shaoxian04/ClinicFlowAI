"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listAvailability, type Slot } from "@/lib/appointments";

type Props = {
    from: string; // ISO date YYYY-MM-DD
    to: string;
    onSelect: (slot: Slot) => void;
};

/**
 * Renders the doctor's available slots between {@code from} and {@code to} as
 * a stacked-day grid (1-col mobile, 7-col desktop). Each slot is a clickable
 * tile in the aurora-glass palette. Empty days show a subtle placeholder.
 */
export function AvailabilityCalendar({ from, to, onSelect }: Props) {
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listAvailability(from, to)
            .then((s) => { if (!cancelled) setSlots(s); })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load slots");
            });
        return () => { cancelled = true; };
    }, [from, to]);

    if (error) {
        return (
            <p className="font-sans text-sm text-crimson" role="alert">
                {error}
            </p>
        );
    }
    if (!slots) {
        return (
            <p className="font-sans text-sm text-fog-dim">
                Loading availability…
            </p>
        );
    }

    // Build the contiguous day list between [from, to] inclusive so empty days still render.
    const days = buildDayMap(from, to, slots);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-7 gap-3"
        >
            {[...days.entries()].map(([day, daySlots]) => (
                <div
                    key={day}
                    className="bg-ink-well border border-ink-rim rounded-sm p-3 flex flex-col gap-2"
                >
                    <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                        {formatDayLabel(day)}
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {daySlots.length === 0 && (
                            <p className="font-sans text-xs text-fog-dim/60">No slots</p>
                        )}
                        {daySlots.map((slot) => (
                            <button
                                key={slot.id}
                                onClick={() => onSelect(slot)}
                                className="text-left px-2 py-1 rounded-xs border border-ink-rim hover:border-cyan/60 hover:ring-1 hover:ring-cyan/40 font-sans text-sm text-fog transition-colors"
                            >
                                {formatTime(slot.startAt)}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </motion.div>
    );
}

function buildDayMap(from: string, to: string, slots: Slot[]): Map<string, Slot[]> {
    const days = new Map<string, Slot[]>();
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.set(d.toISOString().slice(0, 10), []);
    }
    for (const s of slots) {
        const day = s.startAt.slice(0, 10);
        if (!days.has(day)) days.set(day, []);
        days.get(day)!.push(s);
    }
    // Sort within each day by startAt
    for (const list of days.values()) {
        list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return days;
}

function formatDayLabel(day: string): string {
    return new Date(day + "T00:00:00").toLocaleDateString("en-MY", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-MY", {
        hour: "2-digit",
        minute: "2-digit",
    });
}
