import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { LABELS, TASK_STATUS, type TaskStatus } from '@pm/shared';
import { GripVertical } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Task } from '../../api/types';
import { useToast } from '../Toast';
import { TaskCardBody } from './TaskCard';
import { refreshTaskData, tasksKey } from './taskQueries';

const STATUS_DOT: Record<TaskStatus, string> = { TODO: 'bg-ink-soft', IN_PROGRESS: 'bg-link', BLOCKED: 'bg-risk-fg', DONE: 'bg-ok-fg' };

/** Cambia el estado de inmediato y lo revierte si el servidor lo rechaza. */
export function useMoveTask(projectId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useCallback(
    async (task: Task, status: TaskStatus) => {
      if (task.status === status) return;
      const key = tasksKey(projectId);
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (tasks) => tasks?.map((t) => (t.id === task.id ? { ...t, status } : t)));
      try {
        await api(`/api/tasks/${task.id}/progress`, { method: 'PATCH', body: { status } });
        await refreshTaskData(queryClient, projectId, task.id);
      } catch (error) {
        queryClient.setQueryData(key, previous);
        toast.error(errorMessage(error));
      }
    },
    [projectId, queryClient, toast],
  );
}

function Card({ task, draggable }: { task: Task; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <li ref={setNodeRef} style={style} className={`flex gap-2 rounded-lg border border-line bg-surface p-3.5 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          data-testid={`drag-${task.id}`}
          aria-label={`Mover ${task.title}`}
          className="cursor-grab touch-none text-ink-soft select-none hover:text-ink"
        >
          <GripVertical size={16} aria-hidden="true" />
        </span>
      )}
      <TaskCardBody task={task} />
    </li>
  );
}

function Column({ status, tasks, canMove }: { status: TaskStatus; tasks: Task[]; canMove: (task: Task) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`flex min-h-48 flex-col rounded-xl p-3 transition-colors duration-150 ${isOver ? 'bg-active' : 'bg-raised'}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
          {LABELS.taskStatus[status]}
        </h3>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-nav">{tasks.length}</span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <Card key={task.id} task={task} draggable={canMove(task)} />
        ))}
      </ul>
    </section>
  );
}

type Props = {
  tasks: Task[];
  canMove: (task: Task) => boolean;
  onMove: (task: Task, status: TaskStatus) => Promise<void>;
};

export function KanbanBoard({ tasks, canMove, onMove }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const task = tasks.find((t) => t.id === active.id);
    if (task && over) void onMove(task, over.id as TaskStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {TASK_STATUS.map((status) => (
          <Column key={status} status={status} tasks={tasks.filter((t) => t.status === status)} canMove={canMove} />
        ))}
      </div>
    </DndContext>
  );
}
