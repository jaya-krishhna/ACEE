import { apiClient, setAccessToken } from './client';
import type { AuthUser, StudentUser, OrganizerUser } from '@/lib/types';

// ─── Helpers to decode the JWT payload without verifying the signature ────────
// (verification is done server-side; we only read claims for UI state)

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function userFromToken(token: string): AuthUser | null {
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  if (payload.role === 'student') {
    return {
      id: payload.id as string,
      name: (payload.name as string) ?? '',
      email: (payload.email as string) ?? '',
      role: 'student',
    } satisfies StudentUser;
  }

  if (payload.role === 'organizer') {
    return {
      id: payload.id as string,
      name: (payload.name as string) ?? '',
      email: (payload.email as string) ?? '',
      role: 'organizer',
      organizationId: payload.organizationId as string,
      membershipRole: payload.membershipRole as 'owner' | 'member',
    } satisfies OrganizerUser;
  }

  return null;
}

// ─── Student auth ─────────────────────────────────────────────────────────────

export async function studentRegister(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>('/api/auth/student/register', data, {
    skipAuth: true,
  });
  setAccessToken(res.accessToken);
  return res;
}

export async function studentLogin(data: {
  email: string;
  password: string;
}): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>('/api/auth/student/login', data, {
    skipAuth: true,
  });
  setAccessToken(res.accessToken);
  return res;
}

// ─── Organizer auth ───────────────────────────────────────────────────────────

export async function organizerRegister(data: {
  organization: {
    name: string;
    org_type: string;
    contact_email: string;
    website_url?: string;
    logo_url?: string;
  };
  owner: {
    name: string;
    email: string;
    password: string;
  };
}): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>('/api/auth/organizer/register', data, {
    skipAuth: true,
  });
  setAccessToken(res.accessToken);
  return res;
}

export async function organizerLogin(data: {
  email: string;
  password: string;
}): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>('/api/auth/organizer/login', data, {
    skipAuth: true,
  });
  setAccessToken(res.accessToken);
  return res;
}

export async function acceptInvite(data: {
  token: string;
  name: string;
  password: string;
}): Promise<{ accessToken: string }> {
  const res = await apiClient.post<{ accessToken: string }>(
    '/api/auth/organizer/accept-invite',
    data,
    { skipAuth: true },
  );
  setAccessToken(res.accessToken);
  return res;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

export async function silentRefresh(): Promise<string | null> {
  try {
    const res = await apiClient.post<{ accessToken: string }>('/api/auth/refresh', undefined, {
      skipAuth: true,
    });
    setAccessToken(res.accessToken);
    return res.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout', undefined, { skipAuth: true });
  } finally {
    setAccessToken(null);
  }
}
