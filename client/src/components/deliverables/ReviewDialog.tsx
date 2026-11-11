import { localToday, type ReviewOutcome } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Attachment, DeliverableDetail, Stakeholder } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { registerKey } from '../RegisterTable';
import { Button, inputClass } from '../ui';
import { deliverableCode } from './DeliverableForm';

/** Ventana para aceptar o rechazar un entregable en nombre de un interesado. */
export function ReviewDialog({
  projectId,
  deliverable,
  outcome,
  onDone,
  onConflict,
  onClose,
}: {
  projectId: string;
  deliverable: DeliverableDetail;
  outcome: ReviewOutcome;
  onDone: (updated: DeliverableDetail) => void;
  /** El entregable cambió en otra ventana: se avisa y se vuelve al detalle recargado. */
  onConflict: (message: string) => void;
  onClose: () => void;
}) {
  const stakeholders = useQuery({ queryKey: registerKey(projectId, 'stakeholders'), queryFn: () => api<Stakeholder[]>(`/api/projects/${projectId}/stakeholders`) });
  const attachments = useQuery({
    queryKey: ['attachments', `/api/projects/${projectId}/attachments`],
    queryFn: () => api<Attachment[]>(`/api/projects/${projectId}/attachments`),
  });
  const [stakeholderId, setStakeholderId] = useState('');
  const [reviewedOn, setReviewedOn] = useState(localToday(new Date()));
  const [note, setNote] = useState('');
  const [attachmentId, setAttachmentId] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const label = outcome === 'ACCEPTED' ? 'Aceptar' : 'Rechazar';
  const needsNote = outcome === 'REJECTED' && !note.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      const updated = await api<DeliverableDetail>(`/api/projects/${projectId}/deliverables/${deliverable.id}/reviews`, {
        method: 'POST',
        body: { outcome, stakeholderId: stakeholderId || null, attachmentId: attachmentId || null, reviewedOn, note },
      });
      onDone(updated);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404 || error.fields?.criteria)) {
        onConflict(error.fields?.criteria ?? error.message);
        return;
      }
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${label} ${deliverableCode(deliverable)}`} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormMessage message={errors.message} />
        </div>
        <FormField label="Interesado" error={errors.fields.stakeholderId}>
          <select className={inputClass} value={stakeholderId} onChange={(e) => setStakeholderId(e.target.value)}>
            <option value="">Sin interesado</option>
            {stakeholders.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha" error={errors.fields.reviewedOn}>
          <input type="date" className={inputClass} value={reviewedOn} onChange={(e) => setReviewedOn(e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Nota" error={errors.fields.note}>
            <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Anexo" error={errors.fields.attachmentId} hint="El acta u otro documento que respalda la revisión, de Anexos.">
            <select className={inputClass} value={attachmentId} onChange={(e) => setAttachmentId(e.target.value)}>
              <option value="">Sin anexo</option>
              {attachments.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={outcome === 'REJECTED' ? 'danger' : 'primary'} disabled={busy || needsNote}>
            {label}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
