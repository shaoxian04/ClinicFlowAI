import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export type WebResult<T> = {
    code: number;
    message: string;
    data: T | null;
};

export async function apiDelete<T>(path: string, body?: unknown): Promise<T | void> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "DELETE",
        headers: {
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    return envelope.data ?? undefined;
}

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

/** POST to an endpoint that intentionally returns data:null on success. */
export async function apiPostVoid(path: string, body?: unknown): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope: WebResult<unknown> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
}

export async function apiGet<T>(path: string): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}

/** PUT to an endpoint that intentionally returns data:null on success. */
export async function apiPutVoid(path: string, body: unknown): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const errBody: WebResult<unknown> = await res.json();
            if (errBody.message) msg = errBody.message;
        } catch { /* ignore parse failure */ }
        throw new Error(msg);
    }
    const envelope: WebResult<unknown> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "PUT",
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

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "PATCH",
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

/** POST FormData (multipart). Do NOT set Content-Type — browser sets it with boundary. */
export async function apiPostMultipart<T>(path: string, body: FormData): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const errBody: WebResult<unknown> = await res.json();
            if (errBody.message) msg = errBody.message;
        } catch { /* ignore parse failure */ }
        throw new Error(msg);
    }
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}
