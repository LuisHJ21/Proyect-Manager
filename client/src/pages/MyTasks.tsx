import { localToday } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../api/client';
import type { Task } from '../api/types';
import { ErrorState } from '../components/ErrorState';
import { WaitingNote } from '../components/tasks/TaskCard';
import { refreshTaskData } from '../components/tasks/taskQueries';
import { useToast } from '../components/Toast';
import { EmptyState, PageHeader, Skeleton } from '../components/ui';
import { projectColor, shortDate } from '../lib/display';
import { groupMyTasks } from '../lib/myTasks';

function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const done = task.status === 'DONE';
  // Evita una segunda solicitud si llega otro clic antes de que se desactive la casilla.
  const inFlight = useRef(false);
  const toggle = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/progress`, { method: 'PATCH', body: { status: done ? 'IN_PROGRESS' : 'DONE' } }),
    onSuccess: () => refreshTaskData(queryClient, task.projectId, task.id),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const onToggle = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    toggle.mutate();
  };

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
      <input
        type="checkbox"
        aria-label={`Marcar ${task.title} como hecha`}
        checked={done}
        disabled={toggle.isPending}
        onChange={onToggle}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-wait"
      />
      <div className="min-w-0 flex-1">
        <Link to={`/proyectos/${task.projectId}/tareas/${task.id}`} className={`font-semibold hover:underline ${done ? 'text-ink-soft line-through' : 'text-ink'}`}>
          {task.title}
        </Link>
        <WaitingNote task={task} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: projectColor(task.projectId) }} aria-hidden="true" />
            <span>{task.projectName}</span>
          </span>
          {task.dueDate && <span className={`font-medium ${overdue ? 'text-risk-fg' : ''}`}>{shortDate(task.dueDate)}</span>}
        </div>
      </div>
    </li>
  );
}

function Group({ title, tasks, overdue }: { title: string; tasks: Task[]; overdue?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`text-base font-semibold ${overdue ? 'text-risk-fg' : 'text-ink'}`}>{title}</h2>
        <span className="text-[13px] text-ink-soft">{tasks.length}</span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} overdue={overdue} />
        ))}
      </ul>
    </section>
  );
}

export function MyTasksPage() {
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<Task[]>('/api/me/tasks') });
  const [showDone, setShowDone] = useState(false);

  const groups = groupMyTasks(tasks.data ?? [], localToday(new Date()), { includeDone: showDone });
  const isEmpty = Object.values(groups).every((list) => list.length === 0);

  return (
    <>
      <PageHeader
        title="Mis tareas"
        description="Las tareas que tienes asignadas en todos tus proyectos."
        actions={
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-nav">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-primary" />
            Mostrar terminadas
          </label>
        }
      />
      {tasks.isPending ? (
        <Skeleton className="h-64" />
      ) : isBlockingError(tasks) ? (
        <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
      ) : isEmpty ? (
        <EmptyState>No tienes tareas pendientes.</EmptyState>
      ) : (
        <div className="max-w-3xl space-y-6">
          <Group title="Vencidas" tasks={groups.overdue} overdue />
          <Group title="Hoy" tasks={groups.today} />
          <Group title="Próximas" tasks={groups.upcoming} />
          <Group title="Sin fecha" tasks={groups.undated} />
        </div>
      )}
    </>
  );
}
