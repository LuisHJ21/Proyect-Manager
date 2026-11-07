import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { LABELS, TASK_STATUS, type TaskStatus } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Task } from '../../api/types';
import { useToast } from '../Toast';
import { TaskCardBody } from './TaskCard';
import { refreshTaskData, tasksKey } from './taskQueries';

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

function Card({ task, draggable, onOpen }: { task: Task; draggable: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <li ref={setNodeRef} style={style} className={`flex gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-xs ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          data-testid={`drag-${task.id}`}
          aria-label={`Mover ${task.title}`}
          className="cursor-grab touch-none text-slate-400 select-none hover:text-slate-700"
        >
          ⠿
        </span>
      )}
      <TaskCardBody task={task} onOpen={onOpen} />
    </li>
  );
}

function Column({ status, tasks, canMove, onOpen }: { status: TaskStatus; tasks: Task[]; canMove: (task: Task) => boolean; onOpen: (task: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`flex min-h-48 flex-col rounded-lg p-3 ${isOver ? 'bg-indigo-50' : 'bg-slate-100'}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{LABELS.taskStatus[status]}</h3>
        <span className="text-xs text-slate-500">{tasks.length}</span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <Card key={task.id} task={task} draggable={canMove(task)} onOpen={() => onOpen(task)} />
        ))}
      </ul>
    </section>
  );
}

type Props = {
  tasks: Task[];
  canMove: (task: Task) => boolean;
  onMove: (task: Task, status: TaskStatus) => Promise<void>;
  onOpen: (task: Task) => void;
};

export function KanbanBoard({ tasks, canMove, onMove, onOpen }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const task = tasks.find((t) => t.id === active.id);
    if (task && over) void onMove(task, over.id as TaskStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUS.map((status) => (
          <Column key={status} status={status} tasks={tasks.filter((t) => t.status === status)} canMove={canMove} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  );
}
