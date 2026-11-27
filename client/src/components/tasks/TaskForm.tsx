import { addDays, LABELS, PRIORITY, type Priority } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, EDIT_CONFLICT_NOTICE, isEditConflict } from '../../api/client';
import type { DeliverableRow, Member, Milestone, Project, Task } from '../../api/types';
import { deliverablesKey } from '../deliverables/DeliverableForm';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { membersKey } from '../project/MembersPanel';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { registerKey } from '../RegisterTable';
import { Button, inputClass } from '../ui';
import { refreshTaskData, tasksKey } from './taskQueries';

const SUMMARY_NOTE = 'Se calcula con sus subtareas';

export function TaskForm({ projectId, task, onClose }: { projectId: string; task?: Task; onClose: () => void }) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`) });
  const milestones = useQuery({
    queryKey: registerKey(projectId, 'milestones'),
    queryFn: () => api<Milestone[]>(`/api/projects/${projectId}/milestones`),
  });

  const project = useQuery({ queryKey: ['project', projectId, 'detail'], queryFn: () => api<Project>(`/api/projects/${projectId}`) });
  const allTasks = useQuery({ queryKey: tasksKey(projectId), queryFn: () => api<Task[]>(`/api/projects/${projectId}/tasks`) });
  const deliverables = useQuery({ queryKey: deliverablesKey(projectId), queryFn: () => api<DeliverableRow[]>(`/api/projects/${projectId}/deliverables`) });
  // Las fechas de una tarea padre son límites fijos para sus subtareas.
  const isSummary = task?.isSummary ?? false;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'MEDIUM');
  const [startDate, setStartDate] = useState((isSummary ? task?.windowStartDate : task?.startDate) ?? '');
  const [dueDate, setDueDate] = useState((isSummary ? task?.windowEndDate : task?.dueDate) ?? '');
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? '');
  const [plannedCostCents, setPlannedCostCents] = useState<number | null>(task?.plannedCostCents ?? 0);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.id) ?? []);
  const [hours, setHours] = useState(task?.estimatedHours != null ? String(task.estimatedHours).replace('.', ',') : '');
  const [parentId, setParentId] = useState(task?.parentId ?? '');
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [deliverableId, setDeliverableId] = useState(task?.deliverableId ?? '');
  const [version, setVersion] = useState(task?.version);

  // No se puede elegir como padre la propia tarea ni una de sus descendientes.
  const descendants = new Set<string>(task ? [task.id] : []);
  for (const t of allTasks.data ?? []) if (t.parentId && descendants.has(t.parentId)) descendants.add(t.id);
  const parentOptions = (allTasks.data ?? []).filter((t) => !descendants.has(t.id));
  const parent = parentOptions.find((t) => t.id === parentId);
  const ancestors: Task[] = [];
  for (let current = parent, seen = new Set<string>(); current && !seen.has(current.id); current = (allTasks.data ?? []).find((t) => t.id === current?.parentId)) {
    ancestors.push(current);
    seen.add(current.id);
  }
  const parentEnd = parent?.isSummary ? parent.windowEndDate : parent?.dueDate;
  const ancestorStarts = ancestors.map((t) => t.isSummary ? t.windowStartDate : t.startDate);
  const ancestorEnds = ancestors.map((t) => t.isSummary ? t.windowEndDate : t.dueDate);
  const predecessors = (allTasks.data ?? []).filter((t) => !t.isSummary && t.id !== task?.id);
  const predecessorMin = predecessors.filter((t) => predecessorIds.includes(t.id) && t.dueDate).map((t) => addDays(t.dueDate!, 1)).sort().at(-1);
  const min = [project.data?.startDate, ...ancestorStarts, predecessorMin].filter(Boolean).sort().at(-1);
  const max = [project.data?.endDate, ...ancestorEnds].filter(Boolean).sort()[0];
  const limits = { min: min || undefined, max: max || undefined };
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
    setStartDate((fresh.isSummary ? fresh.windowStartDate : fresh.startDate) ?? '');
    setDueDate((fresh.isSummary ? fresh.windowEndDate : fresh.dueDate) ?? '');
    setMilestoneId(fresh.milestoneId ?? '');
    setPlannedCostCents(fresh.plannedCostCents ?? 0);
    setAssigneeIds(fresh.assignees.map((a) => a.id));
    setHours(fresh.estimatedHours != null ? String(fresh.estimatedHours).replace('.', ',') : '');
    setParentId(fresh.parentId ?? '');
    setDeliverableId(fresh.deliverableId ?? '');
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
    const estimatedHours = hours.trim() === '' ? null : Number(hours.replace(',', '.'));
    if (estimatedHours !== null && Number.isNaN(estimatedHours)) {
      setBusy(false);
      setErrors({ fields: { estimatedHours: 'Escribe las horas, por ejemplo 12,5' } });
      return;
    }
    const own = isSummary ? { startDate: startDate || null, dueDate: dueDate || null } : { startDate: startDate || null, dueDate: dueDate || null, plannedCostCents, assigneeIds, estimatedHours };
    // Padre y entregable solo viajan si cambiaron.
    const tree = {
      ...((parentId || null) !== (task?.parentId ?? null) ? { parentId: parentId || null } : {}),
      ...((deliverableId || null) !== (task?.deliverableId ?? null) ? { deliverableId: deliverableId || null } : {}),
    };
    const fields = { title, description, priority, milestoneId: milestoneId || null, ...own, ...tree };
    try {
      if (task) {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { ...fields, version } });
      } else {
        await api(`/api/projects/${projectId}/tasks`, { method: 'POST', body: { ...fields, predecessorIds } });
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
        <FormField label="Tarea padre" error={errors.fields.parentId}>
          <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Ninguna (raíz)</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.wbsCode} {t.title}
              </option>
            ))}
          </select>
        </FormField>
        {parentId && <p className="text-sm text-ink-soft sm:col-span-2">{parentEnd ? `Intervalo permitido: ${min ?? 'sin inicio'} a ${max ?? 'sin fin'}.` : `La tarea padre no tiene fecha fin propia. Inicio desde ${min ?? 'cualquier fecha'}; fin ${max ? `hasta ${max} por el proyecto u otra tarea antecesora` : 'sin límite superior'}.`}</p>}
        <FormField label="Entregable" error={errors.fields.deliverableId}>
          <select className={inputClass} value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)}>
            <option value="">Sin entregable</option>
            {deliverables.data?.map((d) => (
              <option key={d.id} value={d.id}>
                ENT-{d.number} · {d.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha de inicio" error={errors.fields.startDate} hint={isSummary ? 'Límite inicial para subtareas' : predecessorMin ? `Después de las predecesoras: desde ${predecessorMin}` : undefined}>
          <input className={inputClass} type="date" {...limits} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Fecha límite" error={errors.fields.dueDate} hint="Si esta tarea tendrá subtareas, deja la fecha vacía para no limitar cuándo terminan">
          <input className={inputClass} type="date" {...limits} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        {!task && <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-medium text-ink-nav">Predecesoras</legend><p className="mb-2 text-sm text-ink-soft">Esta tarea podrá empezar después de que terminen las seleccionadas.</p><div className="max-h-36 space-y-1 overflow-y-auto">{predecessors.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm text-ink-nav"><input type="checkbox" checked={predecessorIds.includes(item.id)} onChange={() => setPredecessorIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />{item.wbsCode} {item.title}</label>)}</div>{predecessors.length === 0 && <p className="text-sm text-ink-soft">No hay tareas disponibles.</p>}{errors.fields.predecessorIds && <p className="mt-1 text-xs text-risk-fg">{errors.fields.predecessorIds}</p>}</fieldset>}
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
        <FormField
          label="Costo planeado"
          error={errors.fields.plannedCostCents}
          hint={isSummary ? SUMMARY_NOTE : 'Para el valor ganado. Déjalo vacío si la tarea no tiene costo.'}
        >
          <MoneyInput value={plannedCostCents} onChange={setPlannedCostCents} blankIsZero disabled={isSummary} />
        </FormField>
        <FormField label="Horas estimadas" error={errors.fields.estimatedHours} hint={isSummary ? SUMMARY_NOTE : 'Esfuerzo total de la tarea, por ejemplo 12,5.'}>
          <input className={inputClass} inputMode="decimal" value={hours} disabled={isSummary} onChange={(e) => setHours(e.target.value)} />
        </FormField>
        {isSummary ? (
          <p className="text-sm text-ink-soft sm:col-span-2">Asignados: {SUMMARY_NOTE.toLowerCase()}.</p>
        ) : (
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
        )}
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
