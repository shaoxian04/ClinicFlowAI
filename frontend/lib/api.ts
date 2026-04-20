import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export type WebResult<T> = {
    code: number;
    message: string;
    data: T | null;
};

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}
