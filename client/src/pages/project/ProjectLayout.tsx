import { CLOSED_PROJECT_STATUS, LABELS, localToday } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage, isBlockingError } from '../../api/client';
import type { Member, Project } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ReopenDialog } from '../../components/closure/ReopenDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { membersKey } from '../../components/project/MembersPanel';
import { TaskForm } from '../../components/tasks/TaskForm';
import { AvatarStack, Badge, Button } from '../../components/ui';
import { shortDate } from '../../lib/display';

/** `readOnly`: el proyecto está cerrado o cancelado y no admite cambios (salvo lecciones aprendidas). */
type ProjectContext = { project: Project; isPm: boolean; readOnly: boolean };

export const useProject = () => useOutletContext<ProjectContext>();

const TABS = [
  { to: 'resumen', label: 'Resumen' },
  { to: 'acta', label: 'Acta' },
  { to: 'tareas', label: 'Tareas' },
  { to: 'anexos', label: 'Anexos' },
  { to: 'incidentes', label: 'Incidentes' },
  { to: 'interesados', label: 'Interesados', pmOnly: true },
  { to: 'riesgos', label: 'Riesgos', pmOnly: true },
  { to: 'presupuesto', label: 'Presupuesto', pmOnly: true },
  { to: 'desempeno', label: 'Desempeño', pmOnly: true },
  { to: 'cambios', label: 'Control de cambios', pmOnly: true },
  { to: 'entregables', label: 'Entregables', pmOnly: true },
  { to: 'cierre', label: 'Cierre', pmOnly: true },
];

export const projectKey = (id: string) => ['project', id, 'detail'];

export function ProjectLayout() {
  const { id = '' } = useParams();
  const { isPm } = useAuth();
  const project = useQuery({ queryKey: projectKey(id), queryFn: () => api<Project>(`/api/projects/${id}`) });
  const members = useQuery({ queryKey: membersKey(id), queryFn: () => api<Member[]>(`/api/projects/${id}/members`) });
  const [creatingTask, setCreatingTask] = useState(false);
  const [reopening, setReopening] = useState(false);
  const team = members.data?.map((m) => ({ id: m.userId, name: m.name })) ?? [];

  if (project.isPending) return <Loading />;
  if (isBlockingError(project)) {
    const isNotFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <ErrorState
        message={errorMessage(project.error)}
        onRetry={isNotFound ? undefined : () => project.refetch()}
      />
    );
  }

  const current = project.data!;
  const readOnly = (CLOSED_PROJECT_STATUS as readonly string[]).includes(current.status);
  const closedLabel = current.status === 'CANCELLED' ? 'Proyecto cancelado' : 'Proyecto cerrado';

  return (
    <>
      <p className="text-[13px] text-ink-soft">
        <Link to="/proyectos" className="hover:text-ink hover:underline">
          Proyectos
        </Link>{' '}
        / {current.name}
      </p>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-semibold text-ink">{current.name}</h1>
        <Badge>{LABELS.projectStatus[current.status]}</Badge>
        <div className="ml-auto flex items-center gap-3">
          <AvatarStack people={team} max={4} />
          {isPm && !readOnly && (
            <Button onClick={() => setCreatingTask(true)}>
              <Plus size={16} aria-hidden="true" />
              Nueva tarea
            </Button>
          )}
        </div>
      </div>
      {readOnly && (
        <div role="status" data-print-hide className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink">
          <span>{`${closedLabel}${current.closedAt ? ` el ${shortDate(localToday(new Date(current.closedAt)))}` : ''} · solo lectura`}</span>
          {isPm && (
            <Button variant="secondary" className="ml-auto" onClick={() => setReopening(true)}>
              Reabrir
            </Button>
          )}
        </div>
      )}
      <nav aria-label="Secciones del proyecto" data-print-hide className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.filter((tab) => isPm || !tab.pmOnly).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px flex min-h-11 items-center border-b-2 px-3.5 text-sm font-medium transition-colors duration-150 ${isActive ? 'border-link font-semibold text-link' : 'border-transparent text-ink-soft hover:text-ink'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ project: current, isPm, readOnly } satisfies ProjectContext} />
      {reopening && <ReopenDialog projectId={current.id} onClose={() => setReopening(false)} />}
      {creatingTask && <TaskForm projectId={current.id} onClose={() => setCreatingTask(false)} />}
    </>
  );
}

/** Secciones reservadas al PM: un colaborador vuelve al resumen sin que se pidan los datos. */
export function ProjectPmOnly() {
  const context = useProject();
  if (!context.isPm) return <Navigate to={`/proyectos/${context.project.id}/resumen`} replace />;
  return <Outlet context={context} />;
}
