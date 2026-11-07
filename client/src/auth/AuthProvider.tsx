import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

type AuthContextValue = {
  user: User | null;
  isPm: boolean;
  needsSetup: boolean;
  isLoading: boolean;
  error: unknown;
  retry: () => void;
  signedIn: (user: User) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const setup = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api<{ needsSetup: boolean }>('/api/setup/status'),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<User>('/api/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });

  useEffect(() => {
    const onUnauthenticated = () => queryClient.setQueryData(['me'], null);
    window.addEventListener('pm:unauthenticated', onUnauthenticated);
    return () => window.removeEventListener('pm:unauthenticated', onUnauthenticated);
  }, [queryClient]);

  // Olvida los datos de la sesión anterior. No usa clear(): este proveedor seguiría leyendo las consultas borradas.
  const setSession = useCallback(
    (user: User | null) => {
      queryClient.removeQueries({ predicate: (query) => !['me', 'setup-status'].includes(String(query.queryKey[0])) });
      queryClient.setQueryData(['me'], user);
      queryClient.setQueryData(['setup-status'], { needsSetup: false });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setSession(null);
  }, [setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      isPm: me.data?.role === 'PM',
      needsSetup: setup.data?.needsSetup ?? false,
      isLoading: me.isPending || setup.isPending,
      error: me.error ?? setup.error,
      retry: () => {
        void me.refetch();
        void setup.refetch();
      },
      signedIn: setSession,
      logout,
    }),
    [me, setup, setSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requiere AuthProvider');
  return value;
}
