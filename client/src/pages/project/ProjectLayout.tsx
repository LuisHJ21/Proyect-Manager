import { CLOSED_PROJECT_STATUS, LABELS, localToday, type Section } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage, isBlockingError } from '../../api/client';
import type { Indicators, Member, Project } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { useAccess } from '../../auth/useAccess';
import { ReopenDialog } from '../../components/closure/ReopenDialog';
import { PauseDialog } from '../../components/project/PauseDialog';
import { ResumeDialog } from '../../components/project/ResumeDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { membersKey } from '../../components/project/MembersPanel';
import { ProjectNav } from '../../components/project/ProjectNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { TaskForm } from '../../components/tasks/TaskForm';
import { AvatarStack, Badge, Button } from '../../components/ui';
import { shortDate } from '../../lib/display';

/** `readOnly`: el proyecto está cerrado o cancelado y no admite cambios (salvo lecciones aprendidas). */
type ProjectContext = { project: Project; isPm: boolean; readOnly: boolean };

export const useProject = () => useOutletContext<ProjectContext>();

export const projectKey = (id: string) => ['project', id, 'detail'];

export function ProjectLayout() {
  const { id = '' } = useParams();
  const { isPm } = useAuth();
  const { canRead } = useAccess();
  const project = useQuery({ queryKey: projectKey(id), queryFn: () => api<Project>(`/api/projects/${id}`) });
  const members = useQuery({ queryKey: membersKey(id), queryFn: () => api<Member[]>(`/api/projects/${id}/members`) });
  // Las tareas vencidas se marcan en el menú; es la misma consulta que usa el Resumen.
  const indicators = useQuery({ queryKey: ['project', id, 'indicators'], queryFn: () => api<Indicators>(`/api/projects/${id}/indicators`) });
  const isMobile = useIsMobile();
  const [creatingTask, setCreatingTask] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
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
    <div className="flex flex-col gap-8 md:flex-row md:items-start">
      {!isMobile && (
        <aside aria-label="Menú del proyecto" className="w-56 shrink-0 self-stretch border-r border-line pr-4">
          <ProjectNav canRead={canRead} overdueTasks={indicators.data?.overdueTasks ?? 0} compact={false} />
        </aside>
      )}
      <div className="min-w-0 flex-1">
        <header className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line pb-5">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-soft [overflow-wrap:anywhere]">
              <Link to="/proyectos" className="hover:text-ink hover:underline">
                Proyectos
              </Link>{' '}
              / {current.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 text-[26px] font-semibold text-ink [overflow-wrap:anywhere]">{current.name}</h1>
              <Badge>{LABELS.projectStatus[current.status]}</Badge>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <AvatarStack people={team} max={4} />
            {isPm && (current.status === 'PLANNING' || current.status === 'EXECUTING') && (
              <Button variant="secondary" onClick={() => setPausing(true)}>
                Pausar proyecto
              </Button>
            )}
            {isPm && !readOnly && (
              <Button onClick={() => setCreatingTask(true)}>
                <Plus size={16} aria-hidden="true" />
                Nueva tarea
              </Button>
            )}
          </div>
        </header>
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
        {current.status === 'PAUSED' && (
          <div role="status" data-print-hide className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink">
            <span>{pauseNotice(current.activePause)}</span>
            {isPm && (
              <Button variant="secondary" className="ml-auto" onClick={() => setResuming(true)}>
                Reanudar proyecto
              </Button>
            )}
          </div>
        )}
        {isMobile && <ProjectNav canRead={canRead} overdueTasks={indicators.data?.overdueTasks ?? 0} compact />}
        <Outlet context={{ project: current, isPm, readOnly } satisfies ProjectContext} />
      </div>
      {reopening && <ReopenDialog projectId={current.id} onClose={() => setReopening(false)} />}
      {pausing && <PauseDialog project={current} onClose={() => setPausing(false)} />}
      {resuming && <ResumeDialog project={current} onClose={() => setResuming(false)} />}
      {creatingTask && <TaskForm projectId={current.id} onClose={() => setCreatingTask(false)} />}
    </div>
  );
}

/** «En pausa desde el 1 nov 2026: Prioridad de gerencia · prioridad: Obra urgente». */
function pauseNotice(pause: Project['activePause']): string {
  if (!pause || !pause.pausedOn) return pause?.reason ? `En pausa: ${pause.reason}` : 'En pausa';
  const priority = pause.priorityProject ? ` · prioridad: ${pause.priorityProject.name}` : '';
  return `En pausa desde el ${shortDate(pause.pausedOn)}: ${pause.reason}${priority}`;
}

/** Sección que el perfil no puede leer: vuelve al resumen sin que se pidan los datos. */
export function ProjectSection({ section }: { section: Section }) {
  const context = useProject();
  const { canRead } = useAccess();
  if (!canRead(section)) return <Navigate to={`/proyectos/${context.project.id}/resumen`} replace />;
  return <Outlet context={context} />;
}
