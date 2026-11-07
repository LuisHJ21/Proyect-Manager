import { LABELS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Project } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState, Loading } from '../../components/ErrorState';
import { Badge, EmptyState, PageHeader, ProgressBar } from '../../components/ui';

export function ProjectListPage() {
  const { isPm } = useAuth();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/projects') });

  return (
    <>
      <PageHeader title="Proyectos" />
      {projects.isPending ? (
        <Loading />
      ) : projects.isError ? (
        <ErrorState message={errorMessage(projects.error)} onRetry={() => projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState>{isPm ? 'Aún no hay proyectos. Crea el primero.' : 'Todavía no eres miembro de ningún proyecto.'}</EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => (
            <li key={project.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link to={`/proyectos/${project.id}/resumen`} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">
                  {project.name}
                </Link>
                <Badge>{LABELS.projectStatus[project.status]}</Badge>
              </div>
              <p className="mb-4 line-clamp-2 min-h-10 text-sm text-slate-600">{project.description}</p>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Avance</span>
                <span>{project.progress ?? 0} %</span>
              </div>
              <ProgressBar value={project.progress ?? 0} label={`Avance de ${project.name}`} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
