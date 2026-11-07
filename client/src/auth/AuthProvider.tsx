import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, ApiError, isBlockingError } from '../api/client';
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
    // Un 403 puede significar que el rol cambió con la sesión abierta: se vuelve a consultar.
    const onForbidden = () => void queryClient.invalidateQueries({ queryKey: ['me'] });
    window.addEventListener('pm:unauthenticated', onUnauthenticated);
    window.addEventListener('pm:forbidden', onForbidden);
    return () => {
      window.removeEventListener('pm:unauthenticated', onUnauthenticated);
      window.removeEventListener('pm:forbidden', onForbidden);
    };
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
      // Con una sesión abierta, la configuración inicial ya se hizo: su estado no puede bloquear la entrada.
      needsSetup: !me.data && (setup.data?.needsSetup ?? false),
      isLoading: me.isPending || (!me.data && setup.isPending),
      error: me.data ? null : isBlockingError(me) ? me.error : isBlockingError(setup) ? setup.error : null,
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
