"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../../lib/api";
import { getUser } from "../../../../lib/auth";
import AdminNav from "../../components/AdminNav";

type Role = "STAFF" | "DOCTOR" | "ADMIN";

type CreatedUser = { userId: string; role: string };

const ROLE_LABEL: Record<Role, string> = {
  STAFF: "Staff / Receptionist",
  DOCTOR: "Doctor",
  ADMIN: "Admin",
};

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 16; i++) {
    s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return s + "Aa1!";
}

export default function CreateUserPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState<Role>("STAFF");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [mmcNumber, setMmcNumber] = useState("");
  const [specialty, setSpecialty] = useState("General Practice");
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ user: CreatedUser; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    if (u.role !== "ADMIN") {
      router.replace("/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (tempPassword.length < 12) {
      setError("Temporary password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        role, email, tempPassword, fullName, phone: phone || null,
      };
      if (role === "STAFF") body.employeeId = employeeId || null;
      if (role === "DOCTOR") {
        body.mmcNumber = mmcNumber;
        body.specialty = specialty;
        body.signatureImageUrl = signatureImageUrl || null;
      }
      const data = await apiPost<CreatedUser>("/admin/users", body);
      setSuccess({ user: data, password: tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create user failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked) return null;

  return (
    <>
      <AdminNav active="users" />
      <main className="shell shell-narrow portal-shell staff-shell">
        <header className="page-header">
          <div className="page-header-eyebrow">Clinic admin</div>
          <h1 className="page-header-title">Create user.</h1>
          <p className="page-header-sub">
            Issue a temporary password for a new staff member, doctor, or admin.
            They will be required to change it on first sign-in.
          </p>
        </header>

        <section className="admin-create-panel">
          <h3 className="admin-create-title">New user</h3>
          <form onSubmit={onSubmit} className="admin-create-form">
            <label className="field">
              <span className="field-label">Role</span>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">Full name</span>
              <input
                type="text"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={255}
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">Phone (optional)</span>
              <input
                type="tel"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                placeholder="+60123456789"
                autoComplete="off"
              />
            </label>

            {role === "STAFF" && (
              <label className="field">
                <span className="field-label">Employee ID (optional)</span>
                <input
                  type="text"
                  className="input"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  maxLength={32}
                  autoComplete="off"
                />
              </label>
            )}

            {role === "DOCTOR" && (
              <>
                <label className="field">
                  <span className="field-label">MMC number</span>
                  <input
                    type="text"
                    className="input"
                    value={mmcNumber}
                    onChange={(e) => setMmcNumber(e.target.value)}
                    required
                    maxLength={32}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Specialty</span>
                  <input
                    type="text"
                    className="input"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    required
                    maxLength={64}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Signature image URL (optional)</span>
                  <input
                    type="url"
                    className="input"
                    value={signatureImageUrl}
                    onChange={(e) => setSignatureImageUrl(e.target.value)}
                    maxLength={512}
                    autoComplete="off"
                  />
                </label>
              </>
            )}

            <label className="field">
              <span className="field-label">
                Temporary password (≥ 12 chars)
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="input"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTempPassword(generatePassword())}
                >
                  Generate
                </button>
              </div>
            </label>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => router.push("/admin/users")}
              >
                Cancel
              </button>
            </div>

            {error && <div className="banner banner-error">{error}</div>}

            {success && (
              <div className="banner banner-success" role="status">
                <p style={{ margin: 0, fontWeight: 600 }}>
                  User created — id {success.user.userId}
                </p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.85em" }}>
                  Hand the user this temporary password. It will only work for one
                  sign-in — they must change it.
                </p>
                <code
                  style={{
                    display: "inline-block",
                    marginTop: "0.5rem",
                    padding: "0.25rem 0.5rem",
                    background: "var(--mica, #f1efe9)",
                    borderRadius: "2px",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {success.password}
                </code>
              </div>
            )}
          </form>
        </section>
      </main>
    </>
  );
}
