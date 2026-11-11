import { DELIVERABLE_STATUS, LABELS, type DeliverableStatus } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { DeliverableRow } from '../../api/types';
import { deliverableCode, DeliverableForm, deliverablesKey } from '../../components/deliverables/DeliverableForm';
import { ErrorState, Loading } from '../../components/ErrorState';
import { Badge, Button, Card, EmptyState, inputClass, type Tone } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

export const DELIVERABLE_TONE: Record<DeliverableStatus, Tone> = { PENDING: 'neutral', IN_REVIEW: 'info', ACCEPTED: 'success', REJECTED: 'danger' };

/** Registro de entregables del proyecto, con sus criterios de aceptación. Solo para el Project Manager. */
export function DeliverablesPage() {
  const { project } = useProject();
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [, setViewingId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: [...deliverablesKey(project.id), 'list', status],
    queryFn: () => api<DeliverableRow[]>(`/api/projects/${project.id}/deliverables${status ? `?status=${status}` : ''}`),
  });

  return (
    <Card title="Entregables" actions={<Button variant="secondary" onClick={() => setAdding(true)}>Añadir entregable</Button>}>
      <div className="mb-4">
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Estado</span>
          <select aria-label="Estado" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {DELIVERABLE_STATUS.map((s) => (
              <option key={s} value={s}>
                {LABELS.deliverableStatus[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>Aún no hay entregables.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                {['Número', 'Entregable', 'Hito', 'Fecha comprometida', 'Criterios', 'Estado'].map((h) => (
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
              {list.data.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 pr-4 font-medium whitespace-nowrap text-ink">{deliverableCode(d)}</td>
                  <td className="min-w-40 py-2 pr-4 text-ink [overflow-wrap:break-word]">{d.name}</td>
                  <td className="py-2 pr-4 text-ink-nav">{d.milestone?.name ?? '—'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">
                    {d.dueDate ? shortDate(d.dueDate) : '—'}
                    {d.overdue && (
                      <span className="ml-2">
                        <Badge tone="danger">Vencido</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{`${d.criteriaMet}/${d.criteriaTotal}`}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={DELIVERABLE_TONE[d.status]}>{LABELS.deliverableStatus[d.status]}</Badge>
                  </td>
                  <td className="py-1 text-right">
                    <Button variant="ghost" aria-label={`Ver ${deliverableCode(d)}`} onClick={() => setViewingId(d.id)}>
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <DeliverableForm projectId={project.id} onClose={() => setAdding(false)} />}
    </Card>
  );
}
