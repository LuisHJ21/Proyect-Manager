import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

/** Ventana para reabrir un proyecto cerrado; el motivo queda en el historial de cierre. */
export function ReopenDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/reopen`, { method: 'POST', body: { reason } });
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
    <Modal title="Reabrir proyecto" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Motivo" error={errors.fields.reason}>
          <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !reason.trim()}>
            Reabrir
          </Button>
        </div>
      </form>
    </Modal>
  );
}
