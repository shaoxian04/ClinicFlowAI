"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";

import { fadeUp, staggerChildren } from "@/design/motion";
import { cn } from "@/design/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Separator } from "@/components/ui/Separator";
import { getAppointment, cancelAppointment, type Appointment } from "@/lib/appointments";
import { getUser } from "@/lib/auth";

const STATUS_BADGE: Record<Appointment["status"], string> = {
    BOOKED: "text-cyan border-cyan/40 bg-cyan/10",
    COMPLETED: "text-fog-dim border-ink-rim bg-ink-well",
    CANCELLED: "text-crimson border-crimson/40 bg-crimson/10",
    NO_SHOW: "text-fog-dim border-ink-rim bg-ink-well",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
    BOOKED: "Booked",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No show",
};

function StatusBadge({ status }: { status: Appointment["status"] }) {
    return (
        <span
            className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-xs border font-mono text-[10px] uppercase tracking-widest",
                STATUS_BADGE[status]
            )}
        >
            {STATUS_LABEL[status]}
        </span>
    );
}

function DataRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 py-3 border-b border-ink-rim last:border-0">
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                {label}
            </p>
            <p className="font-sans text-sm text-fog">{value}</p>
        </div>
    );
}

function CancelDialog({
    onConfirm,
    onCancel,
    busy,
    error,
}: {
    onConfirm: (reason: string) => void;
    onCancel: () => void;
    busy: boolean;
    error: string | null;
}) {
    const [reason, setReason] = useState("");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
        >
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-md bg-ink-well border border-ink-rim rounded-sm p-6"
            >
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                    Cancel appointment
                </p>
                <h2 className="font-display text-xl text-fog leading-tight mb-1">
                    Are you sure?
                </h2>
                <p className="font-sans text-sm text-fog-dim mb-4">
                    This cannot be undone. You can book a new appointment afterwards.
                </p>

                <label className="block mb-1 font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Reason (optional)
                </label>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. schedule conflict"
                    rows={3}
                    className="min-h-[72px] w-full resize-y rounded-sm border border-ink-rim bg-obsidian px-3 py-2 text-sm font-sans text-fog placeholder:text-fog-dim/50 focus:outline-none focus:ring-1 focus:ring-cyan/40"
                />

                {error && (
                    <p className="font-sans text-sm text-crimson mt-3" role="alert">
                        {error}
                    </p>
                )}

                <div className="flex gap-2 mt-5">
                    <Button
                        onClick={() => onConfirm(reason)}
                        loading={busy}
                        variant="primary"
                        className="flex-1 !bg-crimson/20 !border-crimson/40 !text-crimson hover:!bg-crimson/30"
                    >
                        Cancel appointment
                    </Button>
                    <Button onClick={onCancel} variant="ghost" className="flex-1">
                        Keep it
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

export default function AppointmentDetailPage() {
    const router = useRouter();
    const params = useParams();
    const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

    const [appointment, setAppointment] = useState<Appointment | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [cancelBusy, setCancelBusy] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!id) return;
        setLoaded(false);
        setFetchError(null);
        getAppointment(id)
            .then((a) => {
                if (!a) setFetchError("Appointment not found.");
                else setAppointment(a);
                setLoaded(true);
            })
            .catch((e) => {
                setFetchError(e instanceof Error ? e.message : "Failed to load appointment");
                setLoaded(true);
            });
    }, [id]);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        load();
    }, [router, load]);

    async function handleCancel(reason: string) {
        if (!appointment) return;
        setCancelBusy(true);
        setCancelError(null);
        try {
            await cancelAppointment(appointment.id, reason || undefined);
            setShowCancelDialog(false);
            // Refetch to reflect cancelled state
            load();
        } catch (e) {
            setCancelError(e instanceof Error ? e.message : "Cancellation failed");
        } finally {
            setCancelBusy(false);
        }
    }

    const cancellable =
        appointment?.status === "BOOKED" &&
        new Date(appointment.startAt).getTime() - Date.now() > 2 * 3600 * 1000;

    const startDate = appointment
        ? new Date(appointment.startAt).toLocaleDateString("en-MY", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : "";
    const startTime = appointment
        ? new Date(appointment.startAt).toLocaleTimeString("en-MY", {
              hour: "2-digit",
              minute: "2-digit",
          })
        : "";
    const endTime = appointment
        ? new Date(appointment.endAt).toLocaleTimeString("en-MY", {
              hour: "2-digit",
              minute: "2-digit",
          })
        : "";

    return (
        <motion.main
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-2xl mx-auto px-6 py-10"
        >
            {/* Breadcrumb */}
            <motion.div variants={fadeUp} className="mb-6">
                <Link
                    href="/portal/appointments"
                    className="font-sans text-sm text-fog-dim hover:text-cyan transition-colors"
                >
                    ← All appointments
                </Link>
            </motion.div>

            {/* Skeleton */}
            {!loaded && (
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-64 w-full" />
                </div>
            )}

            {/* Error */}
            {loaded && fetchError && (
                <motion.div variants={fadeUp}>
                    <div className="px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm mb-6">
                        <p className="font-sans text-sm text-crimson" role="alert">
                            {fetchError}
                        </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/portal/appointments">Back to appointments</Link>
                    </Button>
                </motion.div>
            )}

            {/* Detail */}
            {loaded && appointment && (
                <>
                    <motion.div variants={fadeUp} className="mb-6">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                                Appointment detail
                            </p>
                            <StatusBadge status={appointment.status} />
                        </div>
                        <h1 className="font-display text-3xl text-fog leading-tight">
                            {startDate}
                        </h1>
                        <p className="font-sans text-sm text-fog-dim mt-1">
                            {startTime} – {endTime}
                        </p>
                    </motion.div>

                    <Separator className="mb-6" />

                    <motion.div variants={fadeUp}>
                        <Card className="p-5">
                            <DataRow
                                label="Type"
                                value={
                                    appointment.type === "FOLLOW_UP"
                                        ? "Follow-up visit"
                                        : "New symptom visit"
                                }
                            />
                            <DataRow label="Doctor" value={appointment.doctorName ?? appointment.doctorId} />
                            <DataRow label="Status" value={STATUS_LABEL[appointment.status]} />
                            {appointment.status === "CANCELLED" && appointment.cancelledAt && (
                                <DataRow
                                    label="Cancelled at"
                                    value={new Date(appointment.cancelledAt).toLocaleString("en-MY")}
                                />
                            )}
                        </Card>
                    </motion.div>

                    {/* Actions */}
                    <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3">
                        {cancellable && (
                            <Button
                                onClick={() => setShowCancelDialog(true)}
                                variant="ghost"
                                className="self-start border-crimson/30 text-crimson hover:border-crimson/60 hover:bg-crimson/10"
                            >
                                Cancel this appointment
                            </Button>
                        )}

                        {appointment.status === "COMPLETED" && appointment.visitId && (
                            <Button asChild variant="ghost" size="sm" className="self-start">
                                <Link
                                    href={`/portal/book/follow-up?parentVisitId=${appointment.visitId}`}
                                >
                                    Book a follow-up →
                                </Link>
                            </Button>
                        )}
                    </motion.div>
                </>
            )}

            {showCancelDialog && (
                <CancelDialog
                    onConfirm={handleCancel}
                    onCancel={() => {
                        setShowCancelDialog(false);
                        setCancelError(null);
                    }}
                    busy={cancelBusy}
                    error={cancelError}
                />
            )}
        </motion.main>
    );
}
