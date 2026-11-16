import { LABELS, type Priority, type TaskStatus } from '@pm/shared';
import { Calendar, ListChecks, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { AvatarStack, Badge, ProgressBar, type Tone } from '../ui';

export const STATUS_TONE: Record<TaskStatus, Tone> = { TODO: 'neutral', IN_PROGRESS: 'info', BLOCKED: 'danger', DONE: 'success' };
export const PRIORITY_TONE: Record<Priority, Tone> = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger' };

export const taskPath = (task: { id: string; projectId: string }) => `/proyectos/${task.projectId}/tareas/${task.id}`;

export function WaitingNote({ task }: { task: Task }) {
  if (task.waitingOn.length === 0) return null;
  return <p className="mt-1 text-xs text-warn-fg">En espera de: {task.waitingOn.map((t) => t.title).join(', ')}</p>;
}

export function StepCount({ task }: { task: Task }) {
  return (
    <span className="flex items-center gap-1 text-xs text-ink-soft" title="Pasos completados">
      <ListChecks size={13} aria-hidden="true" />
      <span>
        {task.stepsDone} de {task.stepsTotal}
      </span>
    </span>
  );
}

export function TaskCardBody({ task, parent }: { task: Task; parent?: { wbsCode: string; title: string } }) {
  const comments = task.commentCount;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {parent && <span className="truncate text-xs text-ink-soft">{`${parent.wbsCode} ${parent.title}`}</span>}
      <span>
        <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
      </span>
      <Link to={taskPath(task)} className="font-semibold text-ink hover:underline">
        {task.title}
      </Link>
      <WaitingNote task={task} />
      {task.progress > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar value={task.progress} label={`Avance de ${task.title}`} />
          </div>
          <span className="text-xs text-ink-soft">{task.progress} %</span>
        </div>
      )}
      {task.stepsTotal > 0 && <StepCount task={task} />}
      <div className="flex items-center gap-3 text-xs text-ink-soft">
        {task.dueDate && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Calendar size={13} aria-hidden="true" />
            <span>{shortDate(task.dueDate)}</span>
          </span>
        )}
        <span className="flex items-center gap-1" aria-label={`${comments} ${comments === 1 ? 'comentario' : 'comentarios'}`}>
          <MessageSquare size={13} aria-hidden="true" />
          {comments}
        </span>
        <span className="ml-auto">{task.assignees.length > 0 && <AvatarStack people={task.assignees} />}</span>
      </div>
    </div>
  );
}
