import { LABELS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../../api/client';
import type { Project } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState, Loading } from '../../components/ErrorState';
import { Badge } from '../../components/ui';

type ProjectContext = { project: Project; isPm: boolean };

export const useProject = () => useOutletContext<ProjectContext>();

const TABS = [
  { to: 'resumen', label: 'Resumen' },
  { to: 'acta', label: 'Acta' },
  { to: 'tareas', label: 'Tareas' },
  { to: 'anexos', label: 'Anexos' },
  { to: 'interesados', label: 'Interesados', pmOnly: true },
  { to: 'riesgos', label: 'Riesgos', pmOnly: true },
  { to: 'presupuesto', label: 'Presupuesto', pmOnly: true },
];

export const projectKey = (id: string) => ['project', id, 'detail'];

export function ProjectLayout() {
  const { id = '' } = useParams();
  const { isPm } = useAuth();
  const project = useQuery({ queryKey: projectKey(id), queryFn: () => api<Project>(`/api/projects/${id}`) });

  if (project.isPending) return <Loading />;
  if (project.isError) {
    const isNotFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <ErrorState
        message={errorMessage(project.error)}
        onRetry={isNotFound ? undefined : () => project.refetch()}
      />
    );
  }

  return (
    <>
      <Link to="/proyectos" className="text-sm text-slate-500 hover:underline">
        ← Proyectos
      </Link>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{project.data.name}</h1>
        <Badge>{LABELS.projectStatus[project.data.status]}</Badge>
      </div>
      <nav aria-label="Secciones del proyecto" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.filter((tab) => isPm || !tab.pmOnly).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ project: project.data, isPm } satisfies ProjectContext} />
    </>
  );
}

/** Secciones reservadas al PM: un colaborador vuelve al resumen sin que se pidan los datos. */
export function ProjectPmOnly() {
  const context = useProject();
  if (!context.isPm) return <Navigate to={`/proyectos/${context.project.id}/resumen`} replace />;
  return <Outlet context={context} />;
}
