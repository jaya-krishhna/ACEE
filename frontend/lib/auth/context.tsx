'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  silentRefresh,
  studentLogin,
  studentRegister,
  organizerLogin,
  organizerRegister,
  logout as apiLogout,
  acceptInvite as apiAcceptInvite,
  userFromToken,
} from '@/lib/api/auth';
import { setAccessToken } from '@/lib/api/client';
import type { AuthUser } from '@/lib/types';

// ─── Context types ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;

  /** Student sign-in */
  loginStudent: (email: string, password: string) => Promise<void>;
  registerStudent: (name: string, email: string, password: string) => Promise<void>;

  /** Organizer sign-in */
  loginOrganizer: (email: string, password: string) => Promise<void>;
  registerOrganizer: (data: {
    organization: {
      name: string;
      org_type: string;
      contact_email: string;
      website_url?: string;
      logo_url?: string;
    };
    owner: { name: string; email: string; password: string };
  }) => Promise<void>;

  /** Accept member invite */
  acceptInvite: (token: string, name: string, password: string) => Promise<void>;

  /** Sign out */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: attempt silent refresh to restore session from httpOnly cookie
  useEffect(() => {
    silentRefresh()
      .then((token) => {
        if (token) {
          setUser(userFromToken(token));
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const applyToken = useCallback((token: string) => {
    setAccessToken(token);
    setUser(userFromToken(token));
  }, []);

  const loginStudent = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await studentLogin({ email, password });
      applyToken(accessToken);
    },
    [applyToken],
  );

  const registerStudent = useCallback(
    async (name: string, email: string, password: string) => {
      const { accessToken } = await studentRegister({ name, email, password });
      applyToken(accessToken);
    },
    [applyToken],
  );

  const loginOrganizer = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await organizerLogin({ email, password });
      applyToken(accessToken);
    },
    [applyToken],
  );

  const registerOrganizer = useCallback(
    async (data: Parameters<AuthContextValue['registerOrganizer']>[0]) => {
      const { accessToken } = await organizerRegister(data);
      applyToken(accessToken);
    },
    [applyToken],
  );

  const acceptInvite = useCallback(
    async (token: string, name: string, password: string) => {
      const { accessToken } = await apiAcceptInvite({ token, name, password });
      applyToken(accessToken);
    },
    [applyToken],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginStudent,
        registerStudent,
        loginOrganizer,
        registerOrganizer,
        acceptInvite,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
