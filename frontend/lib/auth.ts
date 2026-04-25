const TOKEN_KEY = "cliniflow.token";
const USER_KEY = "cliniflow.user";

export type AuthUser = {
    userId: string;
    email: string;
    role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
    fullName: string;
    consentGiven?: boolean;
    devSeedAllowed?: boolean;
};

export function saveAuth(token: string, user: AuthUser): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function clearAuth(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export function markConsentGiven(): void {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const user = JSON.parse(raw) as AuthUser;
    const updated: AuthUser = { ...user, consentGiven: true };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
}
