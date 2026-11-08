import { formatMoney } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { BaselineInfo, ChangeRequest } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { changeRequestsKey } from '../../pages/project/ChangeRequests';
import { Button, Card, inputClass } from '../ui';

const describe = (b: BaselineInfo, currency: string) =>
  `${new Date(b.createdAt).toLocaleDateString('es')} · ${b.createdBy.name} · BAC ${formatMoney(b.bacCents, currency)}`;

function NewBaselineDialog({ projectId, onSubmit, onClose }: { projectId: string; onSubmit: (body: { reason: string; changeRequestId?: string }) => Promise<void>; onClose: () => void }) {
  const changes = useQuery({ queryKey: changeRequestsKey(projectId), queryFn: () => api<ChangeRequest[]>(`/api/projects/${projectId}/change-requests`) });
  const approved = changes.data?.filter((c) => c.status === 'APPROVED') ?? [];
  const [reason, setReason] = useState('');
  const [changeRequestId, setChangeRequestId] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await onSubmit({ reason, ...(changeRequestId ? { changeRequestId } : {}) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Fijar nueva línea base" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <p className="text-sm text-ink-nav">Se guardará una foto de las tareas con costo y sus fechas actuales. Las versiones anteriores quedan en el historial.</p>
        <FormField label="Motivo" error={errors.fields.reason}>
          <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <FormField label="Cambio aprobado (opcional)" error={errors.fields.changeRequestId}>
          <select className={inputClass} value={changeRequestId} onChange={(e) => setChangeRequestId(e.target.value)}>
            <option value="">Sin cambio ligado</option>
            {approved.map((c) => (
              <option key={c.id} value={c.id}>
                {`CR-${c.number} · ${c.title}`}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !reason.trim()}>
            Fijar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Línea base vigente, botón para fijar una nueva versión e historial. */
export function BaselinePanel({
  projectId,
  currency,
  baseline,
  history,
  onFix,
}: {
  projectId: string;
  currency: string;
  baseline: BaselineInfo;
  history: BaselineInfo[];
  onFix: (body: { reason: string; changeRequestId?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Línea base" actions={<Button variant="secondary" onClick={() => setOpen(true)}>Fijar nueva línea base</Button>}>
      <p className="text-sm font-semibold text-ink">Versión {baseline.version}</p>
      <p className="mt-0.5 text-sm text-ink-nav">{describe(baseline, currency)}</p>
      {baseline.reason && <p className="mt-1 text-sm text-ink-nav">Motivo: {baseline.reason}</p>}
      {baseline.changeRequest && (
        <p className="mt-1 text-sm text-ink-nav">
          Cambio: CR-{baseline.changeRequest.number} · {baseline.changeRequest.title}
        </p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-link">Historial ({history.length})</summary>
        <ol aria-label="Historial de líneas base" className="mt-3 space-y-3">
          {history.map((b) => (
            <li key={b.version} className="border-l-2 border-line pl-3 text-sm">
              <p className="font-medium text-ink">Versión {b.version}</p>
              <p className="text-ink-nav">{describe(b, currency)}</p>
              {b.reason && <p className="text-ink-soft">Motivo: {b.reason}</p>}
              {b.changeRequest && <p className="text-ink-soft">Cambio: CR-{b.changeRequest.number} · {b.changeRequest.title}</p>}
            </li>
          ))}
        </ol>
      </details>
      {open && <NewBaselineDialog projectId={projectId} onSubmit={onFix} onClose={() => setOpen(false)} />}
    </Card>
  );
}
