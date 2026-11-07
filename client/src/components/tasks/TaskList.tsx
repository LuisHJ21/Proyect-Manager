import { LABELS } from '@pm/shared';
import type { Task } from '../../api/types';
import { Badge, EmptyState } from '../ui';
import { PRIORITY_TONE, STATUS_TONE, WaitingNote } from './TaskCard';

export function TaskList({ tasks, onOpen, showProject, emptyText }: { tasks: Task[]; onOpen: (task: Task) => void; showProject?: boolean; emptyText: string }) {
  if (tasks.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Tarea</th>
            {showProject && <th className="px-4 py-2 font-medium">Proyecto</th>}
            <th className="px-4 py-2 font-medium">Asignados</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Prioridad</th>
            <th className="px-4 py-2 font-medium">Vence</th>
            <th className="px-4 py-2 font-medium">Avance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="px-4 py-2 align-top">
                <button type="button" onClick={() => onOpen(task)} className="cursor-pointer text-left font-medium text-slate-900 hover:text-indigo-700 hover:underline">
                  {task.title}
                </button>
                <WaitingNote task={task} />
              </td>
              {showProject && <td className="px-4 py-2 align-top text-slate-600">{task.projectName}</td>}
              <td className="px-4 py-2 align-top text-slate-600">{task.assignees.map((a) => a.name).join(', ') || '—'}</td>
              <td className="px-4 py-2 align-top">
                <Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge>
              </td>
              <td className="px-4 py-2 align-top">
                <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
              </td>
              <td className="px-4 py-2 align-top whitespace-nowrap text-slate-600">{task.dueDate ?? '—'}</td>
              <td className="px-4 py-2 align-top text-slate-600">{task.progress} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
