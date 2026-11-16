import { ASSUMPTION_STATUS, LABELS, type AssumptionStatus, type AssumptionTarget } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, EDIT_CONFLICT_NOTICE, errorMessage, isEditConflict } from '../../api/client';
import type { Assumption, Member } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { membersKey } from '../project/MembersPanel';
import { RichTextEditor } from '../richText/RichTextEditor';
import { RichTextClamp } from '../richText/RichTextView';
import { useToast } from '../Toast';
import { Badge, Button, Card, EmptyState, inputClass } from '../ui';
import { shortDate } from '../../lib/display';

export const assumptionsKey = (projectId: string) => ['project', projectId, 'assumptions'];
const code = (a: { number: number }) => `SUP-${a.number}`;
const TONE: Record<AssumptionStatus, 'neutral' | 'success' | 'danger'> = { PENDING: 'neutral', VALID: 'success', FALSE: 'danger' };

function AssumptionForm({ projectId, item, onClose }: { projectId: string; item?: Assumption; onClose: () => void }) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`) });
  const [description, setDescription] = useState(item?.description ?? '');
  const [ownerId, setOwnerId] = useState(item?.owner?.id ?? '');
  const [validateBy, setValidateBy] = useState(item?.validateBy ?? '');
  const [status, setStatus] = useState<AssumptionStatus>(item?.status ?? 'PENDING');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = { description, ownerId: ownerId || null, validateBy: validateBy || null, status };
    try {
      const url = `/api/projects/${projectId}/assumptions`;
      if (item) await api(`${url}/${item.id}`, { method: 'PATCH', body: { ...body, version: item.version } });
      else await api(url, { method: 'POST', body });
      void queryClient.invalidateQueries({ queryKey: assumptionsKey(projectId) });
      onClose();
    } catch (error) {
      if (isEditConflict(error)) {
        setErrors({ fields: {}, message: EDIT_CONFLICT_NOTICE });
        void queryClient.invalidateQueries({ queryKey: assumptionsKey(projectId) });
      } else applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? `Editar ${code(item)}` : 'Añadir supuesto'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Descripción" error={errors.fields.description}>
          <RichTextEditor label="Descripción" value={description} onChange={setDescription} />
        </FormField>
        <FormField label="Responsable" error={errors.fields.ownerId}>
          <select className={inputClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Sin responsable</option>
            {members.data?.filter((m) => m.role !== 'OBSERVER' || m.userId === item?.owner?.id).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Validar antes de" error={errors.fields.validateBy}>
            <input type="date" className={inputClass} value={validateBy} onChange={(e) => setValidateBy(e.target.value)} />
          </FormField>
          <FormField label="Estado" error={errors.fields.status}>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as AssumptionStatus)}>
              {ASSUMPTION_STATUS.map((s) => (
                <option key={s} value={s}>
                  {LABELS.assumptionStatus[s]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
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

/** Registro de supuestos (F15). Todos los miembros lo leen; el PM lo edita y convierte un supuesto falso. */
export function AssumptionsRegister({ projectId, charterText, canEdit }: { projectId: string; charterText: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: assumptionsKey(projectId), queryFn: () => api<Assumption[]>(`/api/projects/${projectId}/assumptions`) });
  const [editing, setEditing] = useState<Assumption | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const convert = async (a: Assumption, kind: AssumptionTarget) => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/assumptions/${a.id}/convert`, { method: 'POST', body: { kind } });
      void queryClient.invalidateQueries({ queryKey: assumptionsKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId, kind === 'risk' ? 'risks' : 'incidents'] });
      toast.success(kind === 'risk' ? `${code(a)} se registró como riesgo` : `${code(a)} se registró como incidente`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const items = list.data ?? [];
  return (
    <div role="region" aria-label="Registro de supuestos">
      <Card title="Registro de supuestos" actions={canEdit ? <Button variant="secondary" onClick={() => setEditing('new')}>Añadir supuesto</Button> : undefined}>
        {charterText.trim() && (
          <div className="mb-4 rounded-md bg-raised px-3 py-2 text-sm">
            <p className="text-xs font-medium text-ink-soft">Supuestos del acta</p>
            <p className="whitespace-pre-line text-ink">{charterText}</p>
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState>{list.isPending ? 'Cargando…' : 'Aún no hay supuestos registrados.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{code(a)}</span>
                  <div className="text-ink">
                    <RichTextClamp html={a.description} />
                  </div>
                  <p className="text-xs text-ink-soft">
                    {[a.owner?.name, a.validateBy ? `validar antes del ${shortDate(a.validateBy)}` : null].filter(Boolean).join(' · ') || 'Sin responsable ni fecha'}
                    {a.risk && ' · Convertido en riesgo'}
                    {a.incident && ` · Convertido en INC-${a.incident.number}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.overdue && <Badge tone="danger">Vencido</Badge>}
                  <Badge tone={TONE[a.status]}>{LABELS.assumptionStatus[a.status]}</Badge>
                  {canEdit && (
                    <Button variant="ghost" onClick={() => setEditing(a)}>
                      Editar
                    </Button>
                  )}
                  {canEdit && a.status === 'FALSE' && !a.risk && !a.incident && (
                    <>
                      <Button variant="secondary" disabled={busy} aria-label={`Convertir ${code(a)} en riesgo`} onClick={() => void convert(a, 'risk')}>
                        Convertir en riesgo
                      </Button>
                      <Button variant="secondary" disabled={busy} aria-label={`Convertir ${code(a)} en incidente`} onClick={() => void convert(a, 'incident')}>
                        Convertir en incidente
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <AssumptionForm projectId={projectId} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
