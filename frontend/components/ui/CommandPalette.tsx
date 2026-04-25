"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Command } from "cmdk";
import { apiGet } from "@/lib/api";
import { clearAuth } from "@/lib/auth";
import { fadeUp } from "@/design/motion";
import { cn } from "@/design/cn";

type VisitSummary = {
  visitId: string;
  patientName: string;
  status: string;
  createdAt: string;
};

const NAV_ITEMS = [
  { label: "Dashboard", path: "/doctor", shortcut: "D" },
  { label: "Queue", path: "/doctor/queue", shortcut: "Q" },
  { label: "Finalized", path: "/doctor/finalized", shortcut: "F" },
  { label: "Patient Portal", path: "/portal", shortcut: "P" },
] as const;

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true;
      apiGet<VisitSummary[]>("/visits")
        .then((data) => {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setVisits(sorted.slice(0, 10));
        })
        .catch(() => {
          // silently ignore — visits section will just be empty
        });
    }
  }, [open]);

  function navigate(path: string) {
    router.push(path);
    onOpenChange(false);
  }

  function signOut() {
    clearAuth();
    router.push("/login");
    onOpenChange(false);
  }

  function formatVisitId(id: string) {
    return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-obsidian/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
            <motion.div
              key="palette-dialog"
              variants={fadeUp}
              initial="initial"
              animate="animate"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              className="w-full max-w-lg"
            >
              <Command
                className={cn(
                  "bg-ink-well border border-ink-rim rounded-sm overflow-hidden",
                  "shadow-[0_0_18px_rgba(34,225,215,0.12),0_20px_60px_rgba(0,0,0,0.5)]"
                )}
                loop
              >
                <div className="border-b border-ink-rim flex items-center px-4">
                  <span className="text-fog-dim/50 font-mono text-xs mr-3" aria-hidden="true">
                    ⌘K
                  </span>
                  <Command.Input
                    placeholder="Search visits, navigate, sign out…"
                    className={cn(
                      "flex-1 bg-transparent py-3 text-fog font-sans text-sm",
                      "placeholder:text-fog-dim/40 focus:outline-none",
                      "caret-cyan"
                    )}
                    autoFocus
                  />
                </div>

                <Command.List className="max-h-72 overflow-y-auto p-2 scrollbar-thin">
                  <Command.Empty className="px-3 py-6 text-center font-mono text-xs text-fog-dim/50">
                    No results found.
                  </Command.Empty>

                  {/* Navigate group */}
                  <Command.Group
                    heading="Navigate"
                    className={cn(
                      "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5",
                      "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px]",
                      "[&_[cmdk-group-heading]]:text-fog-dim [&_[cmdk-group-heading]]:uppercase",
                      "[&_[cmdk-group-heading]]:tracking-widest"
                    )}
                  >
                    {NAV_ITEMS.map((item) => (
                      <Command.Item
                        key={item.path}
                        value={item.label}
                        onSelect={() => navigate(item.path)}
                        className={cn(
                          "flex items-center justify-between gap-3 px-3 py-2 rounded-xs cursor-pointer",
                          "font-mono text-sm text-fog",
                          "data-[selected=true]:bg-cyan/10 data-[selected=true]:text-cyan",
                          "transition-colors duration-100 select-none"
                        )}
                      >
                        <span>{item.label}</span>
                        <span className="font-mono text-[10px] text-fog-dim/40 border border-ink-rim rounded-xs px-1.5 py-0.5">
                          {item.shortcut}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>

                  {/* Recent visits group */}
                  {visits.length > 0 && (
                    <Command.Group
                      heading="Recent Visits"
                      className={cn(
                        "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5",
                        "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px]",
                        "[&_[cmdk-group-heading]]:text-fog-dim [&_[cmdk-group-heading]]:uppercase",
                        "[&_[cmdk-group-heading]]:tracking-widest"
                      )}
                    >
                      {visits.map((v) => (
                        <Command.Item
                          key={v.visitId}
                          value={`${v.patientName} ${v.visitId}`}
                          onSelect={() => navigate(`/doctor/visits/${v.visitId}`)}
                          className={cn(
                            "flex items-center justify-between gap-3 px-3 py-2 rounded-xs cursor-pointer",
                            "font-sans text-sm text-fog",
                            "data-[selected=true]:bg-cyan/10 data-[selected=true]:text-cyan",
                            "transition-colors duration-100 select-none"
                          )}
                        >
                          <span className="truncate">{v.patientName}</span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono text-[10px] text-fog-dim/60">
                              {formatVisitId(v.visitId)}
                            </span>
                            <span className="font-mono text-[10px] text-fog-dim/40">
                              {formatDate(v.createdAt)}
                            </span>
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {/* Actions group */}
                  <Command.Group
                    heading="Actions"
                    className={cn(
                      "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5",
                      "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px]",
                      "[&_[cmdk-group-heading]]:text-fog-dim [&_[cmdk-group-heading]]:uppercase",
                      "[&_[cmdk-group-heading]]:tracking-widest"
                    )}
                  >
                    <Command.Item
                      value="sign out"
                      onSelect={signOut}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xs cursor-pointer",
                        "font-mono text-sm text-crimson/80",
                        "data-[selected=true]:bg-crimson/10 data-[selected=true]:text-crimson",
                        "transition-colors duration-100 select-none"
                      )}
                    >
                      Sign out
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
