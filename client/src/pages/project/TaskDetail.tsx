import { LABELS, TASK_STATUS, type TaskStatus } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage, isBlockingError } from '../../api/client';
import type { Milestone, TaskDetail, TaskWarning } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { FormField, FormMessage } from '../../components/FormField';
import { registerKey } from '../../components/RegisterTable';
import { CommentList } from '../../components/tasks/CommentList';
import { DependencyPicker } from '../../components/tasks/DependencyPicker';
import { StepList } from '../../components/tasks/StepList';
import { PRIORITY_TONE, STATUS_TONE, WaitingNote } from '../../components/tasks/TaskCard';
import { TaskForm } from '../../components/tasks/TaskForm';
import { refreshTaskData, taskKey } from '../../components/tasks/taskQueries';
import { Avatar, Badge, Button, inputClass } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

const WARNINGS: Record<TaskWarning, string> = {
  predecessor_not_done: 'Esta tarea sigue activa, pero tiene una predecesora sin terminar.',
  starts_before_predecessor_due: 'Esta tarea empieza antes de la fecha límite de una predecesora.',
};

function ProgressForm({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient();
  const hasSteps = task.steps.length > 0;
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [progress, setProgress] = useState(String(task.progress));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setStatus(task.status);
    setProgress(String(task.progress));
  }, [task.status, task.progress]);

  const save = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/progress`, { method: 'PATCH', body: hasSteps ? { status } : { status, progress: Number(progress) } }),
    onSuccess: () => refreshTaskData(queryClient, task.projectId, task.id),
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <FormField label="Estado">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {TASK_STATUS.map((value) => (
            <option key={value} value={value}>
              {LABELS.taskStatus[value]}
            </option>
          ))}
        </select>
      </FormField>
      {hasSteps ? (
        <div>
          <p className="text-sm font-medium text-ink-nav">Avance: {task.progress} %</p>
          <p className="mt-0.5 text-xs text-ink-soft">Se calcula con los pasos</p>
        </div>
      ) : (
        <FormField label="Avance (%)">
          <input className={inputClass} type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
        </FormField>
      )}
      <FormMessage message={error} />
      <Button type="submit" className="w-full" disabled={save.isPending}>
        Guardar avance
      </Button>
    </form>
  );
}

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      {title && <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const { project, isPm } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tasksUrl = `/proyectos/${project.id}/tareas`;

  const detail = useQuery({ queryKey: taskKey(taskId), queryFn: () => api<TaskDetail>(`/api/tasks/${taskId}`) });
  const milestones = useQuery({
    queryKey: registerKey(project.id, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${project.id}/milestones`),
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const remove = useMutation({
    mutationFn: () => api(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: taskKey(taskId) });
      await refreshTaskData(queryClient, project.id);
      navigate(tasksUrl);
    },
    onError: (e) => {
      setDeleting(false);
      setDeleteError(errorMessage(e));
    },
  });

  const back = (
    <Link to={tasksUrl} className="mb-4 inline-block text-sm text-ink-soft hover:text-ink hover:underline">
      ← Tareas del proyecto
    </Link>
  );

  if (detail.isPending) return <Loading />;
  if (isBlockingError(detail)) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        {back}
        <ErrorState message={errorMessage(detail.error)} onRetry={notFound ? undefined : () => detail.refetch()} />
      </>
    );
  }

  const task = detail.data!;
  const canUpdate = isPm || task.assignees.some((a) => a.id === user?.id);
  const milestone = milestones.data?.find((m) => m.id === task.milestoneId);

  return (
    <>
      {back}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <h2 className="text-2xl font-semibold text-ink">{task.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge>
              <span className="text-sm text-ink-soft">{task.progress} %</span>
            </div>
            <WaitingNote task={task} />
            <div className="mt-3 space-y-2 empty:hidden">
              {task.warnings.map((warning) => (
                <p key={warning} role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                  {WARNINGS[warning]}
                </p>
              ))}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-ink-nav">{task.description || 'Sin descripción.'}</p>
            {isPm && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Editar tarea
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(true)}>
                  Eliminar tarea
                </Button>
              </div>
            )}
            <div className="mt-3">
              <FormMessage message={deleteError} />
            </div>
          </Panel>
          <StepList task={task} canManage={isPm} canCheck={canUpdate} />
          <Panel>
            <CommentList taskId={task.id} comments={task.comments} canComment={canUpdate} />
          </Panel>
        </div>

        <aside aria-label="Propiedades de la tarea" className="flex min-w-0 flex-col gap-6">
          {canUpdate && (
            <Panel>
              <ProgressForm task={task} />
            </Panel>
          )}
          <Panel>
            <dl>
              <Property label="Asignados">
                {task.assignees.length === 0 ? (
                  'Sin asignar'
                ) : (
                  <span className="flex flex-col items-end gap-1.5">
                    {task.assignees.map((person) => (
                      <span key={person.id} className="flex items-center gap-2">
                        <Avatar name={person.name} size="sm" />
                        {person.name}
                      </span>
                    ))}
                  </span>
                )}
              </Property>
              <Property label="Prioridad">
                <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
              </Property>
              <Property label="Inicio">{shortDate(task.startDate)}</Property>
              <Property label="Fecha límite">{shortDate(task.dueDate)}</Property>
              <Property label="Hito">{milestone?.name ?? '—'}</Property>
            </dl>
          </Panel>
          <Panel>
            <DependencyPicker task={task} canEdit={isPm} />
          </Panel>
          <Panel title="Anexos">
            <AttachmentList scope={{ taskId: task.id }} canUpload={canUpdate} isPm={isPm} currentUserId={user?.id} />
          </Panel>
        </aside>
      </div>

      {editing && <TaskForm projectId={project.id} task={task} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog title="Eliminar tarea" danger confirmLabel="Eliminar" onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()}>
          {task.successorCount > 0 && <p className="font-medium">{task.successorCount} tarea(s) dependen de esta y dejarán de esperarla.</p>}
          <p>Se borrarán de forma permanente sus comentarios y anexos.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
