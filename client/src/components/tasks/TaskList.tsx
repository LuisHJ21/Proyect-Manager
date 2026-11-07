import { LABELS } from '@pm/shared';
import { Link } from 'react-router-dom';
import type { Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { AvatarStack, Badge, EmptyState } from '../ui';
import { PRIORITY_TONE, STATUS_TONE, taskPath, WaitingNote } from './TaskCard';

export function TaskList({ tasks, emptyText }: { tasks: Task[]; emptyText: string }) {
  if (tasks.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <thead className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">Tarea</th>
            <th scope="col" className="px-3 py-3 font-semibold">Asignados</th>
            <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
            <th scope="col" className="px-3 py-3 font-semibold">Prioridad</th>
            <th scope="col" className="px-3 py-3 font-semibold">Vence</th>
            <th scope="col" className="px-5 py-3 font-semibold">Avance</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-line transition-colors duration-150 hover:bg-raised">
              <td className="px-5 py-3 align-top">
                <Link to={taskPath(task)} className="font-semibold text-ink hover:underline">
                  {task.title}
                </Link>
                <WaitingNote task={task} />
              </td>
              <td className="px-3 py-3 align-top">
                <AvatarStack people={task.assignees} />
              </td>
              <td className="px-3 py-3 align-top">
                <Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge>
              </td>
              <td className="px-3 py-3 align-top">
                <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-ink-nav">{shortDate(task.dueDate)}</td>
              <td className="px-5 py-3 align-top text-ink-nav">{task.progress} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
