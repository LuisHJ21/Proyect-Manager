import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { PersonRef, TaskDetail, TaskStep } from '../../api/types';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { useToast } from '../Toast';
import { Avatar, Button, inputClass, ProgressBar } from '../ui';
import { refreshTaskData } from './taskQueries';

function PersonSelect({ people, value, onChange, label }: { people: PersonRef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <select aria-label={label} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin persona</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

function EditStepModal({ task, step, onClose }: { task: TaskDetail; step: TaskStep; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(step.title);
  const [assigneeId, setAssigneeId] = useState(step.assignee?.id ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const save = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/steps/${step.id}`, { method: 'PATCH', body: { title, assigneeId: assigneeId || null } }),
    onSuccess: async () => {
      await refreshTaskData(queryClient, task.projectId, task.id);
      onClose();
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    save.mutate();
  };
  return (
    <Modal title="Editar paso" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Título" error={errors.fields.title}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <div>
          <PersonSelect label="Persona" people={task.assignees} value={assigneeId} onChange={setAssigneeId} />
          {errors.fields.assigneeId && <p className="mt-1 text-xs text-risk-fg">{errors.fields.assigneeId}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StepRow({ task, step, canManage, canCheck }: { task: TaskDetail; step: TaskStep; canManage: boolean; canCheck: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Evita una segunda solicitud si llega otro clic antes de que se desactive la casilla.
  const inFlight = useRef(false);
  const url = `/api/tasks/${task.id}/steps/${step.id}`;
  const refresh = () => refreshTaskData(queryClient, task.projectId, task.id);

  const toggle = useMutation({
    mutationFn: () => api(url, { method: 'PATCH', body: { done: !step.done } }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const remove = useMutation({
    mutationFn: () => api(url, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setDeleting(false),
  });
  const onToggle = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    toggle.mutate();
  };

  return (
    <li className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-1.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={step.done} disabled={!canCheck || toggle.isPending} onChange={onToggle} className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed" />
        <span className={step.done ? 'text-ink-soft line-through' : 'text-ink'}>{step.title}</span>
      </label>
      {step.assignee && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          <Avatar name={step.assignee.name} size="sm" />
          <span>{step.assignee.name}</span>
        </span>
      )}
      {canManage && (
        <span className="flex shrink-0">
          <button type="button" aria-label={`Editar paso ${step.title}`} onClick={() => setEditing(true)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-raised hover:text-ink">
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Eliminar paso ${step.title}`} onClick={() => setDeleting(true)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-raised hover:text-ink">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </span>
      )}
      {editing && <EditStepModal task={task} step={step} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog title="Eliminar paso" danger confirmLabel="Eliminar" onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()}>
          Se eliminará «{step.title}» de forma permanente.
        </ConfirmDialog>
      )}
    </li>
  );
}

export function StepList({ task, canManage, canCheck }: { task: TaskDetail; canManage: boolean; canCheck: boolean }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const add = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/steps`, { method: 'POST', body: { title, assigneeId: assigneeId || null } }),
    onSuccess: async () => {
      setTitle('');
      setAssigneeId('');
      await refreshTaskData(queryClient, task.projectId, task.id);
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    add.mutate();
  };

  const total = task.steps.length;
  const done = task.steps.filter((s) => s.done).length;

  return (
    <section aria-label="Pasos" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-ink">Pasos</h2>
        {total > 0 && (
          <>
            <span className="text-[13px] text-ink-soft">
              {done} de {total} completados
            </span>
            <div className="max-w-48 min-w-24 flex-1">
              <ProgressBar value={Math.round((done / total) * 100)} label="Pasos completados" />
            </div>
          </>
        )}
      </div>
      {total === 0 ? (
        <p className="text-sm text-ink-soft">Sin pasos.</p>
      ) : (
        <ul className="space-y-1.5">
          {task.steps.map((step) => (
            <StepRow key={step.id} task={task} step={step} canManage={canManage} canCheck={canCheck} />
          ))}
        </ul>
      )}
      {canManage && (
        <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
          <FormMessage message={errors.message} />
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_11rem_auto]">
            <FormField label="Nuevo paso" error={errors.fields.title}>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <PersonSelect label="Persona del nuevo paso" people={task.assignees} value={assigneeId} onChange={setAssigneeId} />
            <Button type="submit" variant="secondary" disabled={add.isPending || !title.trim()}>
              <Plus size={16} aria-hidden="true" />
              Añadir paso
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
