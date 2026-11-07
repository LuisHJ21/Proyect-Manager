import { LABELS } from '@pm/shared';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from './ui';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`;

export function AppLayout() {
  const { user, isPm, logout } = useAuth();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
        <p className="mb-6 px-3 text-sm font-bold tracking-tight text-indigo-700">Gestor de proyectos</p>
        <nav aria-label="Principal" className="flex-1 space-y-1">
          <NavLink to="/proyectos" className={linkClass}>
            Proyectos
          </NavLink>
          <NavLink to="/mis-tareas" className={linkClass}>
            Mis tareas
          </NavLink>
          {isPm && (
            <NavLink to="/usuarios" className={linkClass}>
              Usuarios
            </NavLink>
          )}
        </nav>
        <div className="border-t border-slate-200 pt-3">
          <p className="truncate px-3 text-sm font-medium text-slate-900">{user?.name}</p>
          <p className="px-3 text-xs text-slate-500">{user && LABELS.role[user.role]}</p>
          <NavLink to="/cambiar-contrasena" className="mt-2 block px-3 py-1 text-xs text-slate-600 hover:underline">
            Cambiar mi contraseña
          </NavLink>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
