import type { AuthUser } from "../../lib/auth";

const LABELS: Record<AuthUser["role"], string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  STAFF: "Staff",
  ADMIN: "Admin",
};

export function RoleChip({ role }: { role: AuthUser["role"] }) {
  return (
    <span className={`role-chip role-chip--${role.toLowerCase()}`} data-role={role}>
      {LABELS[role]}
    </span>
  );
}
