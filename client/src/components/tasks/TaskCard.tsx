import { LABELS, type Priority, type TaskStatus } from '@pm/shared';
import type { Task } from '../../api/types';
import { Badge, type Tone } from '../ui';

export const STATUS_TONE: Record<TaskStatus, Tone> = { TODO: 'neutral', IN_PROGRESS: 'info', BLOCKED: 'danger', DONE: 'success' };
export const PRIORITY_TONE: Record<Priority, Tone> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning' };

export function WaitingNote({ task }: { task: Task }) {
  if (task.waitingOn.length === 0) return null;
  return <p className="mt-1 text-xs text-amber-800">En espera de: {task.waitingOn.map((t) => t.title).join(', ')}</p>;
}

export function TaskCardBody({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <div className="min-w-0 flex-1">
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left text-sm font-medium text-slate-900 hover:text-indigo-700 hover:underline">
        {task.title}
      </button>
      <WaitingNote task={task} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
        {task.dueDate && <span>Vence {task.dueDate}</span>}
        <span>{task.progress} %</span>
      </div>
      {task.assignees.length > 0 && <p className="mt-1 truncate text-xs text-slate-500">{task.assignees.map((a) => a.name).join(', ')}</p>}
    </div>
  );
}
