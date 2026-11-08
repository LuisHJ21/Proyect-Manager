import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { RaciMatrixData } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

type Activity = RaciMatrixData['activities'][number];

/** Ventana para crear o editar una actividad de la matriz RACI. */
export function ActivityForm({ projectId, activity, onSaved, onClose }: { projectId: string; activity?: Activity; onSaved: () => Promise<unknown>; onClose: () => void }) {
  const [title, setTitle] = useState(activity?.title ?? '');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      const base = `/api/projects/${projectId}/raci/activities`;
      const body = { title, description };
      if (activity) await api(`${base}/${activity.id}`, { method: 'PATCH', body });
      else await api(base, { method: 'POST', body });
      await onSaved();
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={activity ? 'Editar actividad' : 'Añadir actividad'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Actividad" error={errors.fields.title}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Descripción" error={errors.fields.description}>
          <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
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
