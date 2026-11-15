import { LABELS, PRIORITY, type Priority } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, EDIT_CONFLICT_NOTICE, isEditConflict } from '../../api/client';
import type { Member, Milestone, Project, Task } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { membersKey } from '../project/MembersPanel';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { registerKey } from '../RegisterTable';
import { Button, inputClass } from '../ui';
import { refreshTaskData } from './taskQueries';

export function TaskForm({ projectId, task, onClose }: { projectId: string; task?: Task; onClose: () => void }) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`) });
  const milestones = useQuery({
    queryKey: registerKey(projectId, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${projectId}/milestones`),
  });

  const project = useQuery({ queryKey: ['project', projectId, 'detail'], queryFn: () => api<Project>(`/api/projects/${projectId}`) });
  const limits = { min: project.data?.startDate ?? undefined, max: project.data?.endDate ?? undefined };
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'MEDIUM');
  const [startDate, setStartDate] = useState(task?.startDate ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? '');
  const [plannedCostCents, setPlannedCostCents] = useState<number | null>(task?.plannedCostCents ?? 0);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.id) ?? []);
  const [version, setVersion] = useState(task?.version);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  // Se asigna a miembros activos que ejecutan tareas (no observadores). Quien ya estaba asignado aparece siempre, para poder conservarlo o quitarlo.
  const selectable =
    members.data?.filter((m) => (m.active !== false && m.role !== 'OBSERVER') || task?.assignees.some((a) => a.id === m.userId)) ?? [];

  const toggleAssignee = (userId: string) =>
    setAssigneeIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));

  /** Tras un choque, el formulario toma la versión guardada por la otra persona. */
  const reload = async (taskId: string) => {
    const fresh = await api<Task>(`/api/tasks/${taskId}`);
    setTitle(fresh.title);
    setDescription(fresh.description);
    setPriority(fresh.priority);
    setStartDate(fresh.startDate ?? '');
    setDueDate(fresh.dueDate ?? '');
    setMilestoneId(fresh.milestoneId ?? '');
    setPlannedCostCents(fresh.plannedCostCents ?? 0);
    setAssigneeIds(fresh.assignees.map((a) => a.id));
    setVersion(fresh.version);
    await refreshTaskData(queryClient, projectId, taskId);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (plannedCostCents === null) {
      setErrors({ fields: { plannedCostCents: INVALID_MONEY_MESSAGE } });
      return;
    }
    setErrors(NO_ERRORS);
    setBusy(true);
    const fields = { title, description, priority, startDate: startDate || null, dueDate: dueDate || null, milestoneId: milestoneId || null, plannedCostCents };
    try {
      if (task) {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { ...fields, assigneeIds, version } });
      } else {
        await api(`/api/projects/${projectId}/tasks`, { method: 'POST', body: { ...fields, assigneeIds } });
      }
      await refreshTaskData(queryClient, projectId, task?.id);
      onClose();
    } catch (error) {
      if (task && isEditConflict(error)) {
        await reload(task.id);
        setErrors({ fields: {}, message: EDIT_CONFLICT_NOTICE });
      } else {
        applyFieldErrors(error, setErrors);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormMessage message={errors.message} />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Título" error={errors.fields.title}>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Descripción" error={errors.fields.description}>
            <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Fecha de inicio" error={errors.fields.startDate}>
          <input className={inputClass} type="date" {...limits} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Fecha límite" error={errors.fields.dueDate}>
          <input className={inputClass} type="date" {...limits} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        <FormField label="Prioridad" error={errors.fields.priority}>
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITY.map((value) => (
              <option key={value} value={value}>
                {LABELS.priority[value]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Hito" error={errors.fields.milestoneId}>
          <select className={inputClass} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            <option value="">Sin hito</option>
            {milestones.data?.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Costo planeado" error={errors.fields.plannedCostCents} hint="Para el valor ganado. Déjalo vacío si la tarea no tiene costo.">
          <MoneyInput value={plannedCostCents} onChange={setPlannedCostCents} blankIsZero />
        </FormField>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-ink-nav">Asignados</legend>
          {selectable.length === 0 && <p className="text-sm text-ink-soft">Añade colaboradores al proyecto desde la pestaña Resumen.</p>}
          <div className="flex flex-wrap gap-3">
            {selectable.map((member) => (
              <label key={member.userId} className="flex items-center gap-2 text-sm text-ink-nav">
                <input type="checkbox" checked={assigneeIds.includes(member.userId)} onChange={() => toggleAssignee(member.userId)} />
                {member.active === false ? `${member.name} (inactivo)` : member.name}
              </label>
            ))}
          </div>
          {errors.fields.assigneeIds && (
            <p className="mt-1 text-xs text-risk-fg">{errors.fields.assigneeIds}</p>
          )}
        </fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar tarea
          </Button>
        </div>
      </form>
    </Modal>
  );
}
