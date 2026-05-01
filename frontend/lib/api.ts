import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export type WebResult<T> = {
    code: number;
    message: string;
    data: T | null;
};

const HTTP_FALLBACK: Record<number, string> = {
    400: "The request was invalid. Please check the data and try again.",
    401: "Your session has expired. Please sign in again.",
    403: "You don't have permission to perform this action.",
    404: "The requested resource was not found.",
    409: "This action conflicts with the current state of the visit. It may already be finalized or in another stage.",
    413: "The uploaded file is too large.",
    422: "Some required information is missing or invalid.",
    429: "Too many requests. Please wait a moment and try again.",
    500: "The server encountered an unexpected error. Please try again.",
    502: "The server is temporarily unreachable. Please try again.",
    503: "The service is temporarily unavailable. Please try again.",
    504: "The server took too long to respond. Please try again.",
};

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const errBody: WebResult<unknown> = await res.json();
        if (errBody?.message) return errBody.message;
    } catch {
        /* ignore parse failure */
    }
    return HTTP_FALLBACK[res.status] ?? `Request failed (HTTP ${res.status}).`;
}

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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
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
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const envelope: WebResult<T> = await res.json();
    if (envelope.code !== 0) {
        throw new Error(envelope.message || `code ${envelope.code}`);
    }
    if (envelope.data == null) throw new Error("empty response data");
    return envelope.data;
}
