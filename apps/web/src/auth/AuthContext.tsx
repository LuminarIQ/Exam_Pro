import { createContext, useContext, useMemo, useState } from 'react';
import { parseJwt, type AppRole } from './types';

interface AuthState {
  accessToken: string | null;
  role: AppRole | null;
  userId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken?: string, csrfToken?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return { accessToken: null, role: null, userId: null };
    const payload = parseJwt(token);
    return { accessToken: token, role: payload?.role ?? null, userId: payload?.sub ?? null };
  });

  const value = useMemo(
    () => ({
      ...state,
      login: (accessToken: string, refreshToken?: string, csrfToken?: string) => {
        localStorage.setItem('accessToken', accessToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        if (csrfToken) localStorage.setItem('csrfToken', csrfToken);
        const payload = parseJwt(accessToken);
        setState({ accessToken, role: payload?.role ?? null, userId: payload?.sub ?? null });
      },
      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('csrfToken');
        setState({ accessToken: null, role: null, userId: null });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
