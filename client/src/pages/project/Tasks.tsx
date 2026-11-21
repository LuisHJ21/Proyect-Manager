import { LABELS, localToday } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../../api/client';
import type { Milestone, Task } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { useToast } from '../../components/Toast';
import { registerKey } from '../../components/RegisterTable';
import { KanbanBoard, useMoveTask } from '../../components/tasks/KanbanBoard';
import { taskPath } from '../../components/tasks/TaskCard';
import { TaskList } from '../../components/tasks/TaskList';
import { tasksKey } from '../../components/tasks/taskQueries';
import { Timeline } from '../../components/tasks/Timeline';
import { WbsGraph } from '../../components/tasks/WbsGraph';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import { applyQuickFilter, type QuickFilter } from '../../lib/taskFilters';
import { useProject } from './ProjectLayout';
import { useSchedule } from '../../components/tasks/Reschedule';
import { csvFilename, csvMoney, downloadCsv, toCsv } from '../../lib/csv';

const VIEWS = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'lista', label: 'Lista' },
  { id: 'edt', label: 'EDT' },
  { id: 'cronograma', label: 'Cronograma' },
] as const;

function readView(param: string | null) {
  if (param === 'kanban') return 'tablero'; // Enlaces guardados de la versión anterior.
  return VIEWS.find((v) => v.id === param)?.id ?? 'lista';
}

export function TasksPage({ forcedView }: { forcedView?: 'edt' | 'cronograma' }) {
  const { project, isPm, readOnly } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = forcedView ?? readView(params.get('vista'));
  const [filter, setFilter] = useState<QuickFilter>('all');

  const tasks = useQuery({ queryKey: tasksKey(project.id), queryFn: () => api<Task[]>(`/api/projects/${project.id}/tasks`) });
  const milestones = useQuery({
    queryKey: registerKey(project.id, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${project.id}/milestones`),
    enabled: view === 'cronograma',
  });
  const moveTask = useMoveTask(project.id);
  const schedule = useSchedule(project.id, view === 'cronograma');
  const queryClient = useQueryClient();
  const toast = useToast();
  const reorder = useMutation({
    mutationFn: ({ task, direction }: { task: Task; direction: 'up' | 'down' }) => api<Task[]>(`/api/tasks/${task.id}/move`, { method: 'POST', body: { direction } }),
    onSuccess: (list) => queryClient.setQueryData(tasksKey(project.id), list),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const canMove = (task: Task) => !readOnly && (isPm || task.assignees.some((a) => a.id === user?.id));

  const filters: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    ...(isPm ? [] : [{ id: 'mine' as const, label: 'Asignadas a mí' }]),
    { id: 'high', label: 'Prioridad alta' },
    { id: 'week', label: 'Vencen esta semana' },
  ];
  const showFilters = view !== 'cronograma' && view !== 'edt';
  const visible = showFilters ? applyQuickFilter(tasks.data ?? [], filter, { userId: user?.id, today: localToday(new Date()) }) : (tasks.data ?? []);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {forcedView && <div className="w-full"><h2 className="text-2xl font-semibold text-ink">{forcedView === 'edt' ? 'Estructura de desglose del trabajo' : 'Cronograma'}</h2><p className="mt-1 text-sm text-ink-soft">{forcedView === 'edt' ? 'Explora las tareas por niveles y abre cada actividad desde su nodo.' : 'Consulta las fechas, dependencias e hitos del proyecto.'}</p></div>}
        {!forcedView && <div className="max-w-full overflow-x-auto">
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
        </div>}
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
        {tasks.data && tasks.data.length > 0 && (
          <Button
            variant="ghost"
            onClick={() =>
              downloadCsv(
                csvFilename(project.name, 'tareas'),
                toCsv<Task>(
                  [
                    { header: 'EDT', value: (t) => t.wbsCode },
                    { header: 'Tarea', value: (t) => t.title },
                    { header: 'Estado', value: (t) => LABELS.taskStatus[t.status] },
                    { header: 'Prioridad', value: (t) => LABELS.priority[t.priority] },
                    { header: 'Inicio', value: (t) => t.startDate ?? '' },
                    { header: 'Fin', value: (t) => t.dueDate ?? '' },
                    { header: 'Avance %', value: (t) => t.progress },
                    { header: 'Responsables', value: (t) => t.assignees.map((a) => a.name).join(', ') },
                    { header: 'Horas estimadas', value: (t) => t.estimatedHours ?? '' },
                    { header: 'Costo planeado', value: (t) => csvMoney(t.plannedCostCents), onlyIfPresent: 'plannedCostCents' },
                  ],
                  tasks.data!,
                ),
              )
            }
          >
            Exportar CSV
          </Button>
        )}
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
      ) : view === 'edt' ? (
        <WbsGraph tasks={tasks.data ?? []} />
      ) : view === 'tablero' ? (
        <KanbanBoard tasks={visible} canMove={canMove} onMove={moveTask} />
      ) : view === 'cronograma' ? (
        <Timeline tasks={visible} milestones={milestones.data ?? []} schedule={schedule.data} onOpen={(task) => navigate(taskPath(task))} />
      ) : (
        <TaskList
          tasks={tasks.data ?? []}
          matches={filter === 'all' ? undefined : new Set(visible.map((t) => t.id))}
          canMove={isPm && !readOnly}
          onMove={(task, direction) => reorder.mutate({ task, direction })}
          emptyText={isPm ? 'Aún no hay tareas. Crea la primera con «Nueva tarea».' : 'Aún no hay tareas en este proyecto.'}
        />
      )}
    </>
  );
}
