import { LABELS, PRIORITY, REQUIREMENT_STATUS, type Priority, type RequirementStatus } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, EDIT_CONFLICT_NOTICE, isEditConflict } from '../../api/client';
import type { DeliverableRow, Requirement, Stakeholder } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { deliverableCode, deliverablesKey } from '../deliverables/DeliverableForm';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { registerKey } from '../RegisterTable';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';
import { requirementsKey, traceabilityKey } from './RequirementPicker';

/** Alta y edición de un requisito (solo el PM): entregables que lo atienden e interesado de origen. */
export function RequirementForm({ projectId, item, onClose }: { projectId: string; item?: Requirement; onClose: () => void }) {
  const queryClient = useQueryClient();
  const deliverables = useQuery({ queryKey: [...deliverablesKey(projectId), 'list', undefined], queryFn: () => api<DeliverableRow[]>(`/api/projects/${projectId}/deliverables`) });
  const stakeholders = useQuery({ queryKey: registerKey(projectId, 'stakeholders'), queryFn: () => api<Stakeholder[]>(`/api/projects/${projectId}/stakeholders`) });
  const [description, setDescription] = useState(item?.description ?? '');
  const [priority, setPriority] = useState<Priority>(item?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState<RequirementStatus>(item?.status ?? 'PROPOSED');
  const [acceptance, setAcceptance] = useState(item?.acceptance ?? '');
  const [stakeholderId, setStakeholderId] = useState<string | null>(item?.stakeholder?.id ?? null);
  const [deliverableIds, setDeliverableIds] = useState<string[]>(item?.deliverables.map((d) => d.id) ?? []);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = { description, priority, status, acceptance, stakeholderId, deliverableIds };
    try {
      const url = `/api/projects/${projectId}/requirements`;
      if (item) await api(`${url}/${item.id}`, { method: 'PATCH', body: { ...body, version: item.version } });
      else await api(url, { method: 'POST', body });
      void queryClient.invalidateQueries({ queryKey: requirementsKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: traceabilityKey(projectId) });
      onClose();
    } catch (error) {
      if (isEditConflict(error)) {
        setErrors({ fields: {}, message: EDIT_CONFLICT_NOTICE });
        void queryClient.invalidateQueries({ queryKey: requirementsKey(projectId) });
      } else applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setDeliverableIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <Modal title={item ? `Editar REQ-${item.number}` : 'Añadir requisito'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Descripción" error={errors.fields.description}>
          <RichTextEditor label="Descripción" value={description} onChange={setDescription} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Prioridad" error={errors.fields.priority}>
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITY.map((p) => (
                <option key={p} value={p}>
                  {LABELS.priority[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Estado" error={errors.fields.status}>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as RequirementStatus)}>
              {REQUIREMENT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {LABELS.requirementStatus[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Interesado de origen" error={errors.fields.stakeholderId}>
            <select className={inputClass} value={stakeholderId ?? ''} onChange={(e) => setStakeholderId(e.target.value || null)}>
              <option value="">Sin interesado</option>
              {stakeholders.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Criterio de aceptación" error={errors.fields.acceptance}>
          <textarea className={inputClass} rows={2} value={acceptance} onChange={(e) => setAcceptance(e.target.value)} />
        </FormField>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Entregables que lo atienden</legend>
          {deliverables.data?.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {deliverables.data.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={deliverableIds.includes(d.id)} onChange={() => toggle(d.id)} />
                  {`${deliverableCode(d)} · ${d.name}`}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">El proyecto no tiene entregables.</p>
          )}
          {errors.fields.deliverableIds && <p className="text-sm text-danger">{errors.fields.deliverableIds}</p>}
        </fieldset>
        <div className="flex justify-end gap-2">
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
