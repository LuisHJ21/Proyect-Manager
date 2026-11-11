import { LABELS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckSquare, FolderKanban, House, KeyRound, LayoutDashboard, Lightbulb, LogOut, Plus, Users } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Project, Task } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { projectColor } from '../lib/display';
import { useIsMobile } from '../lib/useIsMobile';
import { ProjectForm } from './project/ProjectForm';
import { Avatar, Button } from './ui';

type Destination = { to: string; label: string; Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }> };

const PM_LINKS: Destination[] = [
  { to: '/panel', label: 'Inicio', Icon: House },
  { to: '/calendario', label: 'Calendario', Icon: CalendarDays },
  { to: '/lecciones', label: 'Lecciones', Icon: Lightbulb },
  { to: '/proyectos', label: 'Proyectos', Icon: FolderKanban },
  { to: '/usuarios', label: 'Usuarios', Icon: Users },
];

const COLLABORATOR_LINKS: Destination[] = [
  { to: '/mis-tareas', label: 'Mis tareas', Icon: CheckSquare },
  { to: '/calendario', label: 'Calendario', Icon: CalendarDays },
  { to: '/lecciones', label: 'Lecciones', Icon: Lightbulb },
  { to: '/proyectos', label: 'Proyectos', Icon: FolderKanban },
];

const ACTIVE = new Set(['PLANNING', 'EXECUTING', 'PAUSED']);

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${isActive ? 'bg-active font-semibold text-link' : 'text-ink-nav hover:bg-raised'}`;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1.5 text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
        <LayoutDashboard size={18} aria-hidden="true" />
      </span>
      <span className="font-display text-lg font-bold">Gestor PMBOK</span>
    </Link>
  );
}

function useOpenTaskCount(enabled: boolean): number {
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<Task[]>('/api/me/tasks'), enabled });
  return tasks.data?.filter((t) => t.status !== 'DONE').length ?? 0;
}

function AccountActions() {
  const { logout } = useAuth();
  return (
    <>
      <NavLink to="/cambiar-contrasena" className="flex min-h-8 items-center gap-2 rounded-md px-1 text-xs text-ink-soft hover:text-ink">
        <KeyRound size={14} aria-hidden="true" />
        Cambiar mi contraseña
      </NavLink>
      <button type="button" onClick={() => void logout()} className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-1 text-left text-xs text-ink-soft hover:text-ink">
        <LogOut size={14} aria-hidden="true" />
        Cerrar sesión
      </button>
    </>
  );
}

function Sidebar({ links, openTasks, projects }: { links: Destination[]; openTasks: number; projects: Project[] }) {
  const { user } = useAuth();
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-sidebar px-4 py-5">
      <Brand />
      <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="space-y-0.5">
          {links.map(({ to, label, Icon }) => {
            const isMyTasks = to === '/mis-tareas';
            return (
              <NavLink key={to} to={to} className={sideLink} aria-label={isMyTasks ? `${label}, ${openTasks} abiertas` : undefined}>
                <Icon size={18} aria-hidden="true" />
                {label}
                {isMyTasks && <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-nav">{openTasks}</span>}
              </NavLink>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">Proyectos activos</p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {projects.map((project) => (
              <NavLink key={project.id} to={`/proyectos/${project.id}/resumen`} className={({ isActive }) => `${sideLink({ isActive })} !min-h-9`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: projectColor(project.id) }} aria-hidden="true" />
                <span className="truncate">{project.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <div className="rounded-xl bg-surface p-3">
        <div className="mb-2 flex items-center gap-2.5">
          {user && <Avatar name={user.name} size="lg" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
            <p className="text-xs text-ink-soft">{user && LABELS.role[user.role]}</p>
          </div>
        </div>
        <AccountActions />
      </div>
    </aside>
  );
}

function MobileNav({ links, openTasks }: { links: Destination[]; openTasks: number }) {
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-sidebar" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
      {links.map(({ to, label, Icon }) => {
        const isMyTasks = to === '/mis-tareas';
        return (
          <NavLink
            key={to}
            to={to}
            aria-label={isMyTasks ? `${label}, ${openTasks} abiertas` : undefined}
            className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-link' : 'text-ink-soft'}`}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppLayout() {
  const { user, isPm, logout } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/projects') });
  const openTasks = useOpenTaskCount(!isPm);
  const links = isPm ? PM_LINKS : COLLABORATOR_LINKS;
  const activeProjects = projects.data?.filter((p) => ACTIVE.has(p.status)) ?? [];

  return (
    <div className="flex min-h-screen bg-page">
      {!isMobile && <Sidebar links={links} openTasks={openTasks} projects={activeProjects} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile && (
          <header className="flex items-center justify-between gap-3 border-b border-line bg-sidebar px-4 py-3">
            <Brand />
            <div className="flex items-center gap-1">
              {user && <Avatar name={user.name} />}
              <NavLink to="/cambiar-contrasena" aria-label="Cambiar mi contraseña" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-nav hover:bg-raised">
                <KeyRound size={18} aria-hidden="true" />
              </NavLink>
              <button type="button" aria-label="Cerrar sesión" onClick={() => void logout()} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-ink-nav hover:bg-raised">
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          </header>
        )}
        {isPm && (
          <div className="flex justify-end border-b border-line px-4 py-3 md:px-8">
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" />
              Nuevo proyecto
            </Button>
          </div>
        )}
        <main className={`min-w-0 flex-1 p-4 md:p-8 ${isMobile ? 'pb-24' : ''}`}>
          <Outlet />
        </main>
      </div>
      {isMobile && <MobileNav links={links} openTasks={openTasks} />}
      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(project) => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            navigate(`/proyectos/${project.id}/resumen`);
          }}
        />
      )}
    </div>
  );
}
