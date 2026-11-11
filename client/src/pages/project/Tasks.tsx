import { localToday } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../../api/client';
import type { Milestone, Task } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { registerKey } from '../../components/RegisterTable';
import { KanbanBoard, useMoveTask } from '../../components/tasks/KanbanBoard';
import { taskPath } from '../../components/tasks/TaskCard';
import { TaskList } from '../../components/tasks/TaskList';
import { tasksKey } from '../../components/tasks/taskQueries';
import { Timeline } from '../../components/tasks/Timeline';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import { applyQuickFilter, type QuickFilter } from '../../lib/taskFilters';
import { useProject } from './ProjectLayout';

const VIEWS = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'lista', label: 'Lista' },
  { id: 'cronograma', label: 'Cronograma' },
] as const;

function readView(param: string | null) {
  if (param === 'kanban') return 'tablero'; // Enlaces guardados de la versión anterior.
  return VIEWS.find((v) => v.id === param)?.id ?? 'lista';
}

export function TasksPage() {
  const { project, isPm, readOnly } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = readView(params.get('vista'));
  const [filter, setFilter] = useState<QuickFilter>('all');

  const tasks = useQuery({ queryKey: tasksKey(project.id), queryFn: () => api<Task[]>(`/api/projects/${project.id}/tasks`) });
  const milestones = useQuery({
    queryKey: registerKey(project.id, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${project.id}/milestones`),
    enabled: view === 'cronograma',
  });
  const moveTask = useMoveTask(project.id);
  const canMove = (task: Task) => !readOnly && (isPm || task.assignees.some((a) => a.id === user?.id));

  const filters: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    ...(isPm ? [] : [{ id: 'mine' as const, label: 'Asignadas a mí' }]),
    { id: 'high', label: 'Prioridad alta' },
    { id: 'week', label: 'Vencen esta semana' },
  ];
  const showFilters = view !== 'cronograma';
  const visible = showFilters ? applyQuickFilter(tasks.data ?? [], filter, { userId: user?.id, today: localToday(new Date()) }) : (tasks.data ?? []);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vista de tareas" className="inline-flex rounded-lg border border-control bg-surface p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setParams({ vista: option.id }, { replace: true })}
              className={`min-h-9 cursor-pointer rounded-md px-3 text-sm font-semibold transition-colors duration-150 ${view === option.id ? 'bg-primary text-white' : 'text-ink-nav hover:bg-raised'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {showFilters &&
          filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 ${filter === option.id ? 'border-primary bg-primary text-white' : 'border-control bg-surface text-ink-nav hover:bg-raised'}`}
            >
              {option.label}
            </button>
          ))}
        {showFilters && !tasks.isPending && (
          <span className="ml-auto text-[13px] text-ink-soft">
            {visible.length} {visible.length === 1 ? 'tarea' : 'tareas'}
          </span>
        )}
      </div>

      {tasks.isPending ? (
        <Skeleton className="h-64" />
      ) : isBlockingError(tasks) ? (
        <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
      ) : showFilters && filter !== 'all' && visible.length === 0 ? (
        <EmptyState>
          <p className="mb-3">Ninguna tarea coincide con este filtro.</p>
          <Button variant="secondary" onClick={() => setFilter('all')}>
            Limpiar filtro
          </Button>
        </EmptyState>
      ) : view === 'tablero' ? (
        <KanbanBoard tasks={visible} canMove={canMove} onMove={moveTask} />
      ) : view === 'cronograma' ? (
        <Timeline tasks={visible} milestones={milestones.data ?? []} onOpen={(task) => navigate(taskPath(task))} />
      ) : (
        <TaskList tasks={visible} emptyText={isPm ? 'Aún no hay tareas. Crea la primera con «Nueva tarea».' : 'Aún no hay tareas en este proyecto.'} />
      )}
    </>
  );
}
