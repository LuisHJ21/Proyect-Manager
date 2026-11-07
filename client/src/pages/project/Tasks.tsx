import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Milestone, Task } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState, Loading } from '../../components/ErrorState';
import { registerKey } from '../../components/RegisterTable';
import { KanbanBoard, useMoveTask } from '../../components/tasks/KanbanBoard';
import { TaskDrawer } from '../../components/tasks/TaskDrawer';
import { TaskForm } from '../../components/tasks/TaskForm';
import { TaskList } from '../../components/tasks/TaskList';
import { tasksKey } from '../../components/tasks/taskQueries';
import { Timeline } from '../../components/tasks/Timeline';
import { Button } from '../../components/ui';
import { useProject } from './ProjectLayout';

const VIEWS = [
  { id: 'lista', label: 'Lista' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'cronograma', label: 'Cronograma' },
] as const;

export function TasksPage() {
  const { project, isPm } = useProject();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.id === params.get('vista'))?.id ?? 'lista';
  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const tasks = useQuery({ queryKey: tasksKey(project.id), queryFn: () => api<Task[]>(`/api/projects/${project.id}/tasks`) });
  const milestones = useQuery({
    queryKey: registerKey(project.id, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${project.id}/milestones`),
    enabled: view === 'cronograma',
  });
  const moveTask = useMoveTask(project.id);
  const canMove = (task: Task) => isPm || task.assignees.some((a) => a.id === user?.id);
  const open = (task: Task) => setOpenTaskId(task.id);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Vista de tareas" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setParams({ vista: option.id }, { replace: true })}
              className={`cursor-pointer rounded px-3 py-1.5 text-sm font-medium ${view === option.id ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {isPm && <Button onClick={() => setCreating(true)}>Nueva tarea</Button>}
      </div>

      {tasks.isPending ? (
        <Loading />
      ) : tasks.isError ? (
        <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
      ) : view === 'kanban' ? (
        <KanbanBoard tasks={tasks.data} canMove={canMove} onMove={moveTask} onOpen={open} />
      ) : view === 'cronograma' ? (
        <Timeline tasks={tasks.data} milestones={milestones.data ?? []} onOpen={open} />
      ) : (
        <TaskList tasks={tasks.data} onOpen={open} emptyText={isPm ? 'Aún no hay tareas. Crea la primera.' : 'Aún no hay tareas en este proyecto.'} />
      )}

      {creating && <TaskForm projectId={project.id} onClose={() => setCreating(false)} />}
      {openTaskId && <TaskDrawer projectId={project.id} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
