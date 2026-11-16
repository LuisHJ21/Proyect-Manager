import { ACTIVE_PROJECT_STATUS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { PauseImpact, Project } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';
import { formatHours } from '../tasks/TimeEntries';

/** Pausa por prioridad (etapa 8): motivo, proyecto prioritario y a quién afecta. */
export function PauseDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/projects') });
  const options = (projects.data ?? []).filter((p) => p.id !== project.id && (ACTIVE_PROJECT_STATUS as readonly string[]).includes(p.status));
  const impact = useQuery({
    queryKey: ['project', project.id, 'pause-impact', priorityId],
    queryFn: () => api<PauseImpact>(`/api/projects/${project.id}/pause-impact?priorityProjectId=${encodeURIComponent(priorityId)}`),
    enabled: priorityId !== '',
  });
  const priorityName = options.find((p) => p.id === priorityId)?.name ?? '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/pause`, { method: 'POST', body: { reason, ...(priorityId ? { priorityProjectId: priorityId } : {}) } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
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
    <Modal title="Pausar proyecto" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Motivo" error={errors.fields.reason}>
          <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Prioridad de gerencia" />
        </FormField>
        <FormField label="Proyecto que pasa a tener prioridad" error={errors.fields.priorityProjectId}>
          <select className={inputClass} value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
            <option value="">Ninguno</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        {priorityId && impact.data && (
          <div role="region" aria-label="Personas compartidas" className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink">
            {impact.data.shared.length === 0 ? (
              <p>No comparten personas: este proyecto puede seguir avanzando</p>
            ) : (
              <>
                <p className="mb-1 text-xs text-ink-soft">Horas asignadas en las próximas 4 semanas</p>
                <ul className="space-y-1">
                  {impact.data.shared.map((person) => {
                    const here = person.hours.find((h) => h.projectId === project.id)?.total ?? 0;
                    const there = person.hours.find((h) => h.projectId === priorityId)?.total ?? 0;
                    return <li key={person.userId}>{`${person.name}: ${formatHours(here)} aquí · ${formatHours(there)} en ${priorityName}`}</li>;
                  })}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !reason.trim()}>
            Pausar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
