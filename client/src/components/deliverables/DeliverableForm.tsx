import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { DeliverableDetail, Milestone } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { registerKey } from '../RegisterTable';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';

export const deliverablesKey = (projectId: string) => ['project', projectId, 'deliverables'];
export const deliverableCode = (d: { number: number }) => `ENT-${d.number}`;

/** Ventana para crear un entregable (con sus criterios iniciales) o editar sus datos. */
export function DeliverableForm({ projectId, item, onClose }: { projectId: string; item?: DeliverableDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const milestones = useQuery({ queryKey: registerKey(projectId, 'milestones'), queryFn: () => api<Milestone[]>(`/api/projects/${projectId}/milestones`) });
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [milestoneId, setMilestoneId] = useState(item?.milestone?.id ?? '');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '');
  const [criteria, setCriteria] = useState<string[]>(['']);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const fields = { name, description, milestoneId: milestoneId || null, dueDate: dueDate || null };
    try {
      const url = `/api/projects/${projectId}/deliverables`;
      if (item) {
        const updated = await api<DeliverableDetail>(`${url}/${item.id}`, { method: 'PATCH', body: fields });
        queryClient.setQueryData([...deliverablesKey(projectId), item.id], updated);
      } else {
        await api(url, { method: 'POST', body: { ...fields, criteria: criteria.map((c) => c.trim()).filter(Boolean) } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: deliverablesKey(projectId), exact: false }),
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
    <Modal title={item ? `Editar ${deliverableCode(item)}` : 'Añadir entregable'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormMessage message={errors.message} />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Nombre" error={errors.fields.name}>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Descripción" error={errors.fields.description}>
            <RichTextEditor label="Descripción" value={description} onChange={setDescription} />
          </FormField>
        </div>
        <FormField label="Hito (opcional)" error={errors.fields.milestoneId}>
          <select className={inputClass} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            <option value="">Sin hito</option>
            {milestones.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha comprometida (opcional)" error={errors.fields.dueDate}>
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        {!item && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-ink-nav">Criterios de aceptación</legend>
            <div className="grid gap-2">
              {criteria.map((text, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    aria-label={`Criterio ${index + 1}`}
                    className={inputClass}
                    value={text}
                    onChange={(e) => setCriteria(criteria.map((c, i) => (i === index ? e.target.value : c)))}
                  />
                  {criteria.length > 1 && (
                    <Button variant="ghost" aria-label={`Quitar criterio ${index + 1}`} onClick={() => setCriteria(criteria.filter((_, i) => i !== index))}>
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {errors.fields.criteria && <p className="mt-1 text-sm text-danger">{errors.fields.criteria}</p>}
            <div className="mt-2">
              <Button variant="secondary" onClick={() => setCriteria([...criteria, ''])}>
                Añadir criterio
              </Button>
            </div>
          </fieldset>
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
