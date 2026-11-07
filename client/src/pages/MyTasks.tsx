import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Task } from '../api/types';
import { ErrorState, Loading } from '../components/ErrorState';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { TaskList } from '../components/tasks/TaskList';
import { PageHeader } from '../components/ui';

export function MyTasksPage() {
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<Task[]>('/api/me/tasks') });
  const [open, setOpen] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);

  const visible = tasks.data?.filter((task) => showDone || task.status !== 'DONE') ?? [];

  return (
    <>
      <PageHeader
        title="Mis tareas"
        description="Las tareas que tienes asignadas en todos tus proyectos."
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Mostrar terminadas
          </label>
        }
      />
      {tasks.isPending ? (
        <Loading />
      ) : tasks.isError ? (
        <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
      ) : (
        <TaskList tasks={visible} onOpen={setOpen} showProject emptyText="No tienes tareas pendientes." />
      )}
      {open && <TaskDrawer projectId={open.projectId} taskId={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}
