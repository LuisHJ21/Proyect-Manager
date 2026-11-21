import { Link } from 'react-router-dom';
import type { Task } from '../../api/types';
import { Badge, EmptyState } from '../ui';
import { taskPath } from './TaskCard';

/** Muestra la jerarquía guardada en la EDT; cada rama conserva su orden. */
export function WbsGraph({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <EmptyState>Aún no hay tareas en la EDT.</EmptyState>;

  const ids = new Set(tasks.map((task) => task.id));
  const children = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const parentId = task.parentId && ids.has(task.parentId) ? task.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), task]);
  }

  const branch = (task: Task) => (
    <li key={task.id} className="relative min-w-0 pl-4 before:absolute before:left-0 before:top-6 before:w-4 before:border-t before:border-line sm:pl-6 sm:before:w-6">
      <div className="min-w-0 rounded-xl border border-line bg-surface p-3 shadow-sm sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-raised px-2 py-1 font-mono text-xs font-semibold text-ink-soft">{task.wbsCode}</span>
          <Link to={taskPath(task)} className="min-w-0 break-words font-semibold text-ink underline-offset-2 hover:underline focus-visible:underline">
            {task.title}
          </Link>
          {task.isSummary && <Badge>{task.childCount} subtareas</Badge>}
        </div>
        <p className="mt-2 text-xs text-ink-soft">{task.progress} % completado</p>
      </div>
      {(children.get(task.id)?.length ?? 0) > 0 && (
        <ul className="ml-2 space-y-3 border-l border-line pt-3 sm:ml-4">
          {children.get(task.id)!.map(branch)}
        </ul>
      )}
    </li>
  );

  return <section aria-label="Gráfico de la EDT" className="min-w-0 space-y-5 rounded-xl border border-line bg-raised p-3 sm:p-5">
    <p className="text-sm text-ink-soft">Estructura de desglose del trabajo · {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}</p>
    <ul className="space-y-4 border-l border-line">{(children.get(null) ?? []).map(branch)}</ul>
  </section>;
}
