import { INCIDENT_KIND, LABELS, PRIORITY, type IncidentKind, type Priority } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { DeliverableRow, Incident, Member, Task } from '../../api/types';
import { deliverableCode, deliverablesKey } from '../deliverables/DeliverableForm';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { membersKey } from '../project/MembersPanel';
import { tasksKey } from '../tasks/taskQueries';
import { Button, inputClass } from '../ui';

export const incidentsKey = (projectId: string) => ['project', projectId, 'incidents'];

/** Ventana para reportar o editar un incidente. Solo el PM ve responsable, prioridad y fecha límite. */
export function IncidentForm({ projectId, isPm, incident, initialTaskId, initialTaskTitle, onClose }: { projectId: string; isPm: boolean; incident?: Incident; initialTaskId?: string; initialTaskTitle?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lockedTaskId = !incident ? initialTaskId : undefined;
  const tasks = useQuery({ queryKey: tasksKey(projectId), queryFn: () => api<Task[]>(`/api/projects/${projectId}/tasks`), enabled: !lockedTaskId });
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`), enabled: isPm });
  const [title, setTitle] = useState(incident?.title ?? '');
  const [description, setDescription] = useState(incident?.description ?? '');
  const [taskId, setTaskId] = useState(incident?.task?.id ?? initialTaskId ?? '');
  const [ownerId, setOwnerId] = useState(incident?.owner?.id ?? '');
  const [priority, setPriority] = useState<Priority>(incident?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(incident?.dueDate ?? '');
  const [kind, setKind] = useState<IncidentKind>(incident?.kind ?? 'INCIDENT');
  const [deliverableId, setDeliverableId] = useState(incident?.deliverable?.id ?? '');
  const deliverables = useQuery({ queryKey: [...deliverablesKey(projectId), 'list', ''], queryFn: () => api<DeliverableRow[]>(`/api/projects/${projectId}/deliverables`), enabled: isPm });
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = {
      title,
      description,
      taskId: lockedTaskId || taskId || null,
      ...(isPm ? { ownerId: ownerId || null, priority, dueDate: dueDate || null, kind, deliverableId: deliverableId || null } : {}),
    };
    try {
      const url = `/api/projects/${projectId}/incidents`;
      if (incident) await api(`${url}/${incident.id}`, { method: 'PATCH', body });
      else await api(url, { method: 'POST', body });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: incidentsKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['task'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={incident ? `Editar INC-${incident.number}` : 'Reportar incidente'} onClose={onClose} wide>
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
        <div className="sm:col-span-2">
          <FormField label={lockedTaskId ? 'Tarea' : 'Tarea (opcional)'} error={errors.fields.taskId}>
            {lockedTaskId ? (
              <input className={inputClass} value={initialTaskTitle ?? ''} readOnly />
            ) : (
              <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Sin tarea</option>
                {tasks.data?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            )}
          </FormField>
        </div>
        {isPm && (
          <>
            <FormField label="Responsable" error={errors.fields.ownerId}>
              <select className={inputClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Sin responsable</option>
                {members.data?.filter((m) => m.role !== 'OBSERVER' || m.userId === incident?.owner?.id).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Prioridad" error={errors.fields.priority}>
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITY.map((p) => (
                  <option key={p} value={p}>
                    {LABELS.priority[p]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Fecha límite" error={errors.fields.dueDate}>
              <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
            <FormField label="Tipo" error={errors.fields.kind}>
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}>
                {INCIDENT_KIND.map((k) => (
                  <option key={k} value={k}>
                    {LABELS.incidentKind[k]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Entregable" error={errors.fields.deliverableId}>
              <select className={inputClass} value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)}>
                <option value="">Sin entregable</option>
                {deliverables.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`${deliverableCode(d)} · ${d.name}`}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
