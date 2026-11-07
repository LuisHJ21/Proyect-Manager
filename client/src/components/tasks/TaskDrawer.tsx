import { LABELS, TASK_STATUS, type TaskStatus } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, isBlockingError } from '../../api/client';
import type { TaskDetail, TaskWarning } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AttachmentList } from '../attachments/AttachmentList';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { FormField, FormMessage } from '../FormField';
import { Badge, Button, inputClass } from '../ui';
import { CommentList } from './CommentList';
import { DependencyPicker } from './DependencyPicker';
import { PRIORITY_TONE, STATUS_TONE, WaitingNote } from './TaskCard';
import { TaskForm } from './TaskForm';
import { refreshTaskData, taskKey } from './taskQueries';

const WARNINGS: Record<TaskWarning, string> = {
  predecessor_not_done: 'Esta tarea sigue activa, pero tiene una predecesora sin terminar.',
  starts_before_predecessor_due: 'Esta tarea empieza antes de la fecha límite de una predecesora.',
};

function ProgressForm({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [progress, setProgress] = useState(String(task.progress));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setStatus(task.status);
    setProgress(String(task.progress));
  }, [task.status, task.progress]);

  const save = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/progress`, { method: 'PATCH', body: { status, progress: Number(progress) } }),
    onSuccess: () => refreshTaskData(queryClient, task.projectId, task.id),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="grid items-end gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]" noValidate>
      <FormField label="Estado">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {TASK_STATUS.map((value) => (
            <option key={value} value={value}>
              {LABELS.taskStatus[value]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Avance (%)">
        <input className={inputClass} type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
      </FormField>
      <Button type="submit" disabled={save.isPending}>
        Guardar avance
      </Button>
      <div className="sm:col-span-3">
        <FormMessage message={error} />
      </div>
    </form>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-slate-100 pt-4">{children}</div>;
}

export function TaskDrawer({ projectId, taskId, onClose }: { projectId: string; taskId: string; onClose: () => void }) {
  const { user, isPm } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: taskKey(taskId), queryFn: () => api<TaskDetail>(`/api/tasks/${taskId}`) });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const remove = useMutation({
    mutationFn: () => api(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: taskKey(taskId) });
      await refreshTaskData(queryClient, projectId);
      onClose();
    },
    onError: (e) => {
      setDeleting(false);
      setDeleteError(errorMessage(e));
    },
  });

  if (detail.isPending) {
    return (
      <Modal title="Tarea" onClose={onClose} wide>
        <Loading />
      </Modal>
    );
  }
  if (isBlockingError(detail)) {
    return (
      <Modal title="Tarea" onClose={onClose} wide>
        <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
        <Button variant="secondary" className="mt-4" onClick={onClose}>
          Cerrar
        </Button>
      </Modal>
    );
  }

  const task = detail.data!;
  const isAssignee = task.assignees.some((a) => a.id === user?.id);
  const canUpdate = isPm || isAssignee;

  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge>
          <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
          <span>{task.progress} %</span>
          {task.startDate && <span>Inicio {task.startDate}</span>}
          {task.dueDate && <span>Vence {task.dueDate}</span>}
        </div>
        <WaitingNote task={task} />
        {task.warnings.map((warning) => (
          <p key={warning} role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {WARNINGS[warning]}
          </p>
        ))}
        {task.description && <p className="text-sm whitespace-pre-wrap text-slate-700">{task.description}</p>}
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">Asignados: </span>
          {task.assignees.map((a) => a.name).join(', ') || 'Sin asignar'}
        </p>
        {canUpdate && <ProgressForm task={task} />}
        <Section>
          <DependencyPicker task={task} canEdit={isPm} />
        </Section>
        <Section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Anexos</h3>
          <AttachmentList scope={{ taskId: task.id }} canUpload={canUpdate} isPm={isPm} currentUserId={user?.id} />
        </Section>
        <Section>
          <CommentList taskId={task.id} comments={task.comments} canComment={canUpdate} />
        </Section>
        <FormMessage message={deleteError} />
        <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            {isPm && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Editar tarea
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(true)}>
                  Eliminar tarea
                </Button>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
      {editing && <TaskForm projectId={projectId} task={task} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog title="Eliminar tarea" danger confirmLabel="Eliminar" onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()}>
          {task.successorCount > 0 && <p className="font-medium">{task.successorCount} tarea(s) dependen de esta y dejarán de esperarla.</p>}
          <p>Se borrarán de forma permanente sus comentarios y anexos.</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
