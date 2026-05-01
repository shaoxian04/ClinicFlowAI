"use client";

import Link from "next/link";

const ACTIONS = [
    { eyebrow: "Start", label: "Pre-visit chat", href: "/previsit/new", desc: "5-minute symptom intake" },
    { eyebrow: "Book", label: "Appointment", href: "/portal/book", desc: "Pick a 14-day slot" },
    { eyebrow: "Update", label: "Phone & consent", href: "/portal/profile", desc: "WhatsApp reminders" },
];

export function QuickActionsRow() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ACTIONS.map((a) => (
                <Link
                    key={a.href}
                    href={a.href}
                    className="border border-ink-rim bg-ink-well rounded-sm p-4 hover:border-cyan/60"
                >
                    <p className="font-mono text-[10px] text-cyan/80 uppercase tracking-widest mb-1">
                        {a.eyebrow}
                    </p>
                    <p className="font-sans text-sm text-fog">
                        {a.label} <span className="text-cyan">→</span>
                    </p>
                    <p className="font-sans text-xs text-fog-dim mt-1">{a.desc}</p>
                </Link>
            ))}
        </div>
    );
}
