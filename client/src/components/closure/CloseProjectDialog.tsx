import { LABELS, type ProjectStatus } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { ClosureReport } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';

export const closureKey = (projectId: string) => ['project', projectId, 'closure'];

/** Ventana para cerrar o cancelar el proyecto. Con pendientes, el motivo es obligatorio. */
export function CloseProjectDialog({ projectId, report, onClose }: { projectId: string; report: ClosureReport; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [finalStatus, setFinalStatus] = useState<Extract<ProjectStatus, 'CLOSED' | 'CANCELLED'>>('CLOSED');
  const [summary, setSummary] = useState('');
  const [pendingReason, setPendingReason] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const hasPendings = report.pendings.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/closure`, { method: 'POST', body: { finalStatus, summary, pendingReason } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
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
    <Modal title="Cerrar proyecto" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Estado final" error={errors.fields.finalStatus}>
          <select className={inputClass} value={finalStatus} onChange={(e) => setFinalStatus(e.target.value as 'CLOSED' | 'CANCELLED')}>
            <option value="CLOSED">{LABELS.projectStatus.CLOSED}</option>
            <option value="CANCELLED">{LABELS.projectStatus.CANCELLED}</option>
          </select>
        </FormField>
        <FormField label="Resumen de cierre" error={errors.fields.summary}>
          <RichTextEditor label="Resumen de cierre" value={summary} onChange={setSummary} />
        </FormField>
        {hasPendings && (
          <FormField label="Motivo de los pendientes" error={errors.fields.pendingReason} hint="Quedan pendientes: explica por qué se cierra igualmente.">
            <textarea className={inputClass} rows={3} value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} />
          </FormField>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || (hasPendings && !pendingReason.trim())}>
            Cerrar proyecto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
