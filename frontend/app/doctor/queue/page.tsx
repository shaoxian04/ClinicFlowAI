"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getUser } from "@/lib/auth";
import { fadeUp, staggerChildren } from "@/design/motion";
import { EmptyState } from "@/components/ui/EmptyState";
import DoctorNav from "../components/DoctorNav";

export default function DoctorQueuePage() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); }
  }, [router]);

  return (
    <>
      <DoctorNav active="queue" />
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="flex flex-col"
        >
          <motion.div variants={fadeUp} className="mb-8">
            <p className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest mb-2">
              Clinician workspace
            </p>
            <h1 className="font-display text-3xl text-ink leading-tight">
              Visit <em className="not-italic text-oxblood">queue</em>
            </h1>
          </motion.div>

          <motion.div variants={fadeUp}>
            <EmptyState
              title="No queued visits"
              description="Incoming visit requests will appear here. Coming soon."
            />
          </motion.div>
        </motion.div>
      </main>
    </>
  );
}
