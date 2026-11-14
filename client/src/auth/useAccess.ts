import { accessLevel, type AccessLevel, type Role, type Section } from '@pm/shared';
import { useAuth } from './AuthProvider';

export type Access = { role: Role | null; canRead(s: Section): boolean; canWrite(s: Section): boolean; level(s: Section): AccessLevel };

/** Lo que el perfil de la sesión puede hacer en cada sección, según la tabla de `shared`. El servidor aplica la misma tabla. */
export function useAccess(): Access {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const level = (s: Section): AccessLevel => (role ? accessLevel(role, s) : 'none');
  return { role, level, canRead: (s) => level(s) !== 'none', canWrite: (s) => level(s) === 'write' };
}
