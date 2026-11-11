import { localToday } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ChangeRequest, DecisionRecord, IncidentRef } from '../../api/types';
import { shortDate } from '../../lib/display';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { incidentsKey } from '../incidents/IncidentForm';
import { DetailList } from '../RegisterTable';
import { useToast } from '../Toast';
import { Button, Card, EmptyState, inputClass } from '../ui';

export const decisionsKey = (projectId: string) => ['project', projectId, 'decisions'];
const code = (d: { number: number }) => `DEC-${d.number}`;

function DecisionForm({ projectId, item, onClose }: { projectId: string; item?: DecisionRecord; onClose: () => void }) {
  const queryClient = useQueryClient();
  const changes = useQuery({ queryKey: ['project', projectId, 'change-requests'], queryFn: () => api<ChangeRequest[]>(`/api/projects/${projectId}/change-requests`) });
  const incidents = useQuery({ queryKey: incidentsKey(projectId), queryFn: () => api<IncidentRef[]>(`/api/projects/${projectId}/incidents`) });
  const [title, setTitle] = useState(item?.title ?? '');
  const [rationale, setRationale] = useState(item?.rationale ?? '');
  const [decidedBy, setDecidedBy] = useState(item?.decidedBy ?? '');
  const [decidedOn, setDecidedOn] = useState(item?.decidedOn ?? localToday(new Date()));
  const [changeRequestId, setChangeRequestId] = useState(item?.changeRequest?.id ?? '');
  const [incidentId, setIncidentId] = useState(item?.incident?.id ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = { title, rationale, decidedBy, decidedOn, changeRequestId: changeRequestId || null, incidentId: incidentId || null };
    try {
      const url = `/api/projects/${projectId}/decisions`;
      if (item) await api(`${url}/${item.id}`, { method: 'PATCH', body });
      else await api(url, { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: decisionsKey(projectId) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? `Editar ${code(item)}` : 'Añadir decisión'} onClose={onClose} wide>
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
          <FormField label="Motivo" error={errors.fields.rationale}>
            <textarea className={inputClass} rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Quién decidió" error={errors.fields.decidedBy}>
          <input className={inputClass} value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
        </FormField>
        <FormField label="Fecha" error={errors.fields.decidedOn}>
          <input type="date" className={inputClass} value={decidedOn} onChange={(e) => setDecidedOn(e.target.value)} />
        </FormField>
        <FormField label="Cambio relacionado (opcional)" error={errors.fields.changeRequestId}>
          <select className={inputClass} value={changeRequestId} onChange={(e) => setChangeRequestId(e.target.value)}>
            <option value="">Sin cambio</option>
            {changes.data?.map((c) => (
              <option key={c.id} value={c.id}>{`CR-${c.number} · ${c.title}`}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Incidente relacionado (opcional)" error={errors.fields.incidentId}>
          <select className={inputClass} value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
            <option value="">Sin incidente</option>
            {incidents.data?.map((i) => (
              <option key={i.id} value={i.id}>{`INC-${i.number} · ${i.title}`}</option>
            ))}
          </select>
        </FormField>
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

const links = (d: DecisionRecord) => [d.changeRequest && `CR-${d.changeRequest.number}`, d.incident && `INC-${d.incident.number}`].filter(Boolean).join(' · ') || '—';

type Dialog = { kind: 'new' } | { kind: 'edit' | 'view' | 'delete'; item: DecisionRecord };

/** Registro de decisiones del proyecto. Solo para el Project Manager. */
export function DecisionsCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: decisionsKey(projectId), queryFn: () => api<DecisionRecord[]>(`/api/projects/${projectId}/decisions`) });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const remove = useMutation({
    mutationFn: (item: DecisionRecord) => api(`/api/projects/${projectId}/decisions/${item.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: decisionsKey(projectId) }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: close,
  });
  const action = (label: string, item: DecisionRecord, onClick: () => void) => (
    <Button variant="ghost" aria-label={`${label} ${code(item)}`} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div role="region" aria-label="Decisiones">
      <Card title="Decisiones" actions={<Button variant="secondary" onClick={() => setDialog({ kind: 'new' })}>Añadir decisión</Button>}>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState>Aún no hay decisiones.</EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft uppercase">
                <tr>
                  {['Número', 'Decisión', 'Fecha', 'Decidió', 'Enlaces'].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-4 font-medium whitespace-nowrap text-ink">{code(item)}</td>
                    <td className="min-w-40 py-2 pr-4 text-ink [overflow-wrap:break-word]">{item.title}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{shortDate(item.decidedOn)}</td>
                    <td className="py-2 pr-4 text-ink-nav">{item.decidedBy || '—'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{links(item)}</td>
                    <td className="py-1 text-right whitespace-nowrap">
                      {action('Ver', item, () => setDialog({ kind: 'view', item }))}
                      {action('Editar', item, () => setDialog({ kind: 'edit', item }))}
                      {action('Eliminar', item, () => setDialog({ kind: 'delete', item }))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dialog?.kind === 'new' && <DecisionForm projectId={projectId} onClose={close} />}
        {dialog?.kind === 'edit' && <DecisionForm projectId={projectId} item={dialog.item} onClose={close} />}
        {dialog?.kind === 'view' && (
          <Modal title={`${code(dialog.item)} · ${dialog.item.title}`} onClose={close} wide>
            <DetailList
              rows={[
                { label: 'Motivo', value: dialog.item.rationale || '—' },
                { label: 'Quién decidió', value: dialog.item.decidedBy || '—' },
                { label: 'Fecha', value: shortDate(dialog.item.decidedOn) },
                { label: 'Cambio relacionado', value: dialog.item.changeRequest ? `CR-${dialog.item.changeRequest.number} · ${dialog.item.changeRequest.title}` : '—' },
                { label: 'Incidente relacionado', value: dialog.item.incident ? `INC-${dialog.item.incident.number} · ${dialog.item.incident.title}` : '—' },
              ]}
            />
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={close}>
                Cerrar
              </Button>
            </div>
          </Modal>
        )}
        {dialog?.kind === 'delete' && (
          <ConfirmDialog title="Eliminar decisión" danger confirmLabel="Eliminar" onCancel={close} onConfirm={() => remove.mutate(dialog.item)}>
            Se eliminará «{code(dialog.item)} · {dialog.item.title}» de forma permanente.
          </ConfirmDialog>
        )}
      </Card>
    </div>
  );
}
