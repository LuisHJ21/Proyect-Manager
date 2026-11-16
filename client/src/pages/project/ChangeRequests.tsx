import { formatMoney, LABELS, parseMoneyToCents, type ChangeStatus } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ChangeRequest } from '../../api/types';
import { ConfirmDialog, Modal } from '../../components/ConfirmDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../../components/FormField';
import { INVALID_MONEY_MESSAGE } from '../../components/MoneyInput';
import { DecisionsCard } from '../../components/decisions/DecisionsCard';
import { DetailList } from '../../components/RegisterTable';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, EmptyState, inputClass, type Tone } from '../../components/ui';
import { signedDays } from '../../lib/display';
import { MyProposals } from './MyProposals';
import { useProject } from './ProjectLayout';

export const changeRequestsKey = (projectId: string) => ['project', projectId, 'change-requests'];

export const STATUS_TONE: Record<ChangeStatus, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', APPLIED: 'info' };
export const code = (cr: { number: number }) => `CR-${cr.number}`;

/** Monto con signo opcional: "-1.234,50" → -123450. Vacío → null (sin impacto). Inválido → undefined. */
function parseSignedMoney(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const negative = /^[-−]/.test(trimmed);
  const cents = parseMoneyToCents(trimmed.replace(/^[-−+]\s*/, ''));
  if (cents === null) return undefined;
  return negative ? -cents : cents;
}
const moneyText = (cents: number | null) => (cents === null ? '' : `${cents < 0 ? '-' : ''}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`);
const signedMoney = (cents: number | null, currency: string) => (cents === null ? '—' : `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}`);

function ChangeForm({ projectId, item, onClose }: { projectId: string; item?: ChangeRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [requestedBy, setRequestedBy] = useState(item?.requestedBy ?? '');
  const [scopeImpact, setScopeImpact] = useState(item?.scopeImpact ?? '');
  const [days, setDays] = useState(item?.scheduleImpactDays?.toString() ?? '');
  const [cost, setCost] = useState(moneyText(item?.costImpactCents ?? null));
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const costImpactCents = parseSignedMoney(cost);
    const scheduleImpactDays = days.trim() === '' ? null : Number(days);
    const fields: Record<string, string> = {};
    if (costImpactCents === undefined) fields.costImpactCents = INVALID_MONEY_MESSAGE;
    if (scheduleImpactDays !== null && !Number.isInteger(scheduleImpactDays)) fields.scheduleImpactDays = 'Usa un número entero de días';
    if (Object.keys(fields).length > 0) {
      setErrors({ fields });
      return;
    }
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = { title, description, requestedBy, scopeImpact, scheduleImpactDays, costImpactCents };
    try {
      const url = `/api/projects/${projectId}/change-requests`;
      if (item) await api(`${url}/${item.id}`, { method: 'PATCH', body });
      else await api(url, { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: changeRequestsKey(projectId) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? `Editar ${code(item)}` : 'Añadir cambio'} onClose={onClose} wide>
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
        <FormField label="Solicitado por" error={errors.fields.requestedBy}>
          <input className={inputClass} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
        </FormField>
        <FormField label="Impacto en alcance" error={errors.fields.scopeImpact}>
          <input className={inputClass} value={scopeImpact} onChange={(e) => setScopeImpact(e.target.value)} />
        </FormField>
        <FormField label="Impacto en plazo (días)" error={errors.fields.scheduleImpactDays} hint="Negativo si acorta el plazo.">
          <input className={inputClass} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </FormField>
        <FormField label="Impacto en costo" error={errors.fields.costImpactCents} hint="Negativo si ahorra. Ejemplo: -1.234,50">
          <input className={inputClass} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
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

function DecisionDialog({ projectId, item, status, onClose }: { projectId: string; item: ChangeRequest; status: 'APPROVED' | 'REJECTED'; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const verb = status === 'APPROVED' ? 'Aprobar' : 'Rechazar';
  const decide = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/change-requests/${item.id}/decision`, { method: 'POST', body: { status, note } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      onClose();
    },
    onError: (error) => {
      applyFieldErrors(error, setErrors);
      // Otra pestaña pudo decidirla antes: se recarga el registro para mostrar su estado real.
      void queryClient.invalidateQueries({ queryKey: changeRequestsKey(projectId) });
    },
  });
  return (
    <Modal title={`${verb} ${code(item)}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setErrors(NO_ERRORS);
          decide.mutate();
        }}
      >
        <FormMessage message={errors.message} />
        <p className="text-sm text-ink-nav">{item.title}</p>
        <FormField label="Nota de la decisión" error={errors.fields.note}>
          <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={status === 'REJECTED' ? 'danger' : 'primary'} disabled={!note.trim() || decide.isPending}>
            {verb}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeDetail({ item, currency, onClose }: { item: ChangeRequest; currency: string; onClose: () => void }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Estado', value: <Badge tone={STATUS_TONE[item.status]}>{LABELS.changeStatus[item.status]}</Badge> },
    { label: 'Descripción', value: item.description || '—' },
    { label: 'Solicitado por', value: item.requestedBy || '—' },
    ...(item.proposedBy ? [{ label: 'Propuesta por', value: item.proposedBy.name }] : []),
    { label: 'Impacto en alcance', value: item.scopeImpact || '—' },
    { label: 'Impacto en plazo', value: signedDays(item.scheduleImpactDays) },
    { label: 'Impacto en costo', value: signedMoney(item.costImpactCents, currency) },
  ];
  if (item.status !== 'PENDING') {
    rows.push(
      { label: 'Nota de la decisión', value: item.decisionNote },
      {
        label: 'Decidida',
        value: `${item.decidedBy?.name ?? 'Una cuenta eliminada'}${item.decidedAt ? `, el ${new Date(item.decidedAt).toLocaleDateString('es')}` : ''}`,
      },
    );
  }
  return (
    <Modal title={`${code(item)} · ${item.title}`} onClose={onClose} wide>
      <DetailList rows={rows} />
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit' | 'view' | 'delete'; item: ChangeRequest }
  | { kind: 'decide'; item: ChangeRequest; status: 'APPROVED' | 'REJECTED' };

/** Registro de solicitudes de cambio. El PM las gestiona; un colaborador solo ve y propone las suyas. */
export function ChangeRequestsPage() {
  const { isPm } = useProject();
  return isPm ? <ChangeRegister /> : <MyProposals />;
}

function ChangeRegister() {
  const { project, readOnly } = useProject();
  const queryClient = useQueryClient();
  const toast = useToast();
  const currency = project.currency ?? 'USD';
  const list = useQuery({ queryKey: changeRequestsKey(project.id), queryFn: () => api<ChangeRequest[]>(`/api/projects/${project.id}/change-requests`) });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  const remove = useMutation({
    mutationFn: (item: ChangeRequest) => api(`/api/projects/${project.id}/change-requests/${item.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: changeRequestsKey(project.id) }),
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: changeRequestsKey(project.id) });
    },
    onSettled: close,
  });

  const action = (label: string, item: ChangeRequest, onClick: () => void) => (
    <Button variant="ghost" aria-label={`${label} ${code(item)}`} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Card title="Solicitudes de cambio" actions={readOnly ? undefined : <Button variant="secondary" onClick={() => setDialog({ kind: 'new' })}>Añadir cambio</Button>}>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState>Aún no hay solicitudes de cambio.</EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Número</th>
                  <th className="py-2 pr-4 font-medium">Cambio</th>
                  <th className="py-2 pr-4 font-medium">Plazo</th>
                  <th className="py-2 pr-4 font-medium">Costo</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-4 align-top font-medium whitespace-nowrap text-ink">{code(item)}</td>
                    <td className="py-2 pr-4 align-top text-ink [overflow-wrap:anywhere]">
                      {item.title}
                      {item.proposedBy && <span className="block text-xs text-ink-soft">Propuesta por {item.proposedBy.name}</span>}
                    </td>
                    <td className="py-2 pr-4 align-top whitespace-nowrap text-ink-nav">{signedDays(item.scheduleImpactDays)}</td>
                    <td className="py-2 pr-4 align-top whitespace-nowrap text-ink-nav">{signedMoney(item.costImpactCents, currency)}</td>
                    <td className="py-2 pr-4 align-top">
                      <Badge tone={STATUS_TONE[item.status]}>{LABELS.changeStatus[item.status]}</Badge>
                    </td>
                    <td className="py-2 pr-4 align-top whitespace-nowrap text-ink-nav">{new Date(item.createdAt).toLocaleDateString('es')}</td>
                    <td className="py-1 text-right whitespace-nowrap">
                      {action('Ver', item, () => setDialog({ kind: 'view', item }))}
                      {item.status === 'PENDING' && !readOnly && (
                        <>
                          {action('Aprobar', item, () => setDialog({ kind: 'decide', item, status: 'APPROVED' }))}
                          {action('Rechazar', item, () => setDialog({ kind: 'decide', item, status: 'REJECTED' }))}
                          {action('Editar', item, () => setDialog({ kind: 'edit', item }))}
                          {/* Una propuesta del equipo no se borra: se rechaza con una nota. */}
                          {!item.proposedBy && action('Eliminar', item, () => setDialog({ kind: 'delete', item }))}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dialog?.kind === 'new' && <ChangeForm projectId={project.id} onClose={close} />}
        {dialog?.kind === 'edit' && <ChangeForm projectId={project.id} item={dialog.item} onClose={close} />}
        {dialog?.kind === 'view' && <ChangeDetail item={dialog.item} currency={currency} onClose={close} />}
        {dialog?.kind === 'decide' && <DecisionDialog projectId={project.id} item={dialog.item} status={dialog.status} onClose={close} />}
        {dialog?.kind === 'delete' && (
          <ConfirmDialog title="Eliminar cambio" danger confirmLabel="Eliminar" onCancel={close} onConfirm={() => remove.mutate(dialog.item)}>
            Se eliminará «{code(dialog.item)} · {dialog.item.title}» de forma permanente.
          </ConfirmDialog>
        )}
      </Card>
      <DecisionsCard projectId={project.id} readOnly={readOnly} />
    </div>
  );
}
