/**
 * Centralized API client.
 *
 * - Attaches the JWT access token as a Bearer header.
 * - On 401, attempts ONE silent token refresh then retries.
 * - Always sends credentials (for the httpOnly refresh cookie).
 * - Normalises backend error shapes from Phase 6.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Access-token store (in memory — not localStorage)
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        _accessToken = null;
        return null;
      }
      const data = await res.json();
      _accessToken = data.accessToken ?? null;
      return _accessToken;
    } catch {
      _accessToken = null;
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

export interface RequestOptions extends RequestInit {
  /** If true, skip auth header even if a token exists */
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!skipAuth && _accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  // 401 → try refresh once, then retry
  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      const retried = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
      return handleResponse<T>(retried);
    }
    // Refresh also failed — propagate 401
    return handleResponse<T>(response);
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    // Some endpoints return 200/204 with no body
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  // Parse the backend's centralized error shape
  let message = `Request failed with status ${response.status}`;
  let errors: Record<string, string[]> | undefined;
  try {
    const body = await response.json();
    message = body.message ?? body.error ?? message;
    errors = body.errors;
  } catch {
    // ignore parse failures
  }

  const err = new ApiClientError(message, response.status, errors);
  throw err;
}

// ─── Typed error class ────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// ─── Convenience methods ──────────────────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { refreshAccessToken };
