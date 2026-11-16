import { canAccept, LABELS, type ReviewOutcome } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, EDIT_CONFLICT_NOTICE, errorMessage, isEditConflict } from '../../api/client';
import type { DeliverableDetail, DeliverableReview } from '../../api/types';
import { shortDate } from '../../lib/display';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { DetailList } from '../RegisterTable';
import { RichTextView } from '../richText/RichTextView';
import { useToast } from '../Toast';
import { Badge, Button, type Tone } from '../ui';
import { CriteriaList } from './CriteriaList';
import { deliverableCode, DeliverableForm, deliverablesKey } from './DeliverableForm';
import { ReviewDialog } from './ReviewDialog';

export const DELIVERABLE_TONE: Record<DeliverableDetail['status'], Tone> = { PENDING: 'neutral', IN_REVIEW: 'info', ACCEPTED: 'success', REJECTED: 'danger' };
const OUTCOME_TONE: Record<ReviewOutcome, Tone> = { ACCEPTED: 'success', REJECTED: 'danger' };

type Step = { kind: 'view' } | { kind: 'edit' } | { kind: 'delete' } | { kind: 'review'; outcome: ReviewOutcome };

function ReviewHistory({ reviews }: { reviews: DeliverableReview[] }) {
  return (
    <section aria-label="Revisiones">
      <h3 className="mb-2 text-sm font-semibold text-ink">Revisiones</h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay revisiones.</p>
      ) : (
        <ol className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {'stakeholderName' in r ? (
                  <>
                    <Badge tone={OUTCOME_TONE[r.outcome]}>{LABELS.reviewOutcome[r.outcome]}</Badge>
                    <span className="text-ink-nav">{shortDate(r.reviewedOn)}</span>
                    <span className="text-ink-nav">· {r.stakeholder?.name ?? (r.stakeholderName || '—')}</span>
                  </>
                ) : (
                  // Sin el nombre de quien revisó (solo lo recibe el PM): resultado y fecha.
                  <Badge tone={OUTCOME_TONE[r.outcome]}>{`${LABELS.reviewOutcome[r.outcome]} el ${shortDate(r.reviewedOn)}`}</Badge>
                )}
              </div>
              {r.note && <p className="mt-2 whitespace-pre-line text-ink [overflow-wrap:anywhere]">{r.note}</p>}
              <p className="mt-2 text-ink-nav">
                Anexo:{' '}
                {r.attachment ? (
                  <a className="text-primary underline" href={`/api/attachments/${r.attachment.id}/download`}>
                    {r.attachment.originalName}
                  </a>
                ) : r.attachmentName ? (
                  <span>{`Anexo eliminado (${r.attachmentName})`}</span>
                ) : (
                  '—'
                )}
              </p>
              <ul className="mt-2 space-y-0.5 text-ink-nav">
                {r.criteria.map((c, i) => (
                  <li key={i}>
                    {c.met ? '✓' : '✗'} <span className="sr-only">{c.met ? 'Cumplido:' : 'Sin cumplir:'}</span> {c.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Detalle de un entregable: criterios, acciones según el estado e historial de revisiones. */
export function DeliverableDetailDialog({ projectId, id, readOnly = false, onClose }: { projectId: string; id: string; readOnly?: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = [...deliverablesKey(projectId), id];
  const query = useQuery({ queryKey: key, queryFn: () => api<DeliverableDetail>(`/api/projects/${projectId}/deliverables/${id}`) });
  const [step, setStep] = useState<Step>({ kind: 'view' });
  const [busy, setBusy] = useState(false);

  const refreshList = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [...deliverablesKey(projectId), 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  const applied = (updated: DeliverableDetail) => {
    queryClient.setQueryData(key, updated);
    void refreshList();
  };

  /** Envía un cambio sobre el entregable. Devuelve true si salió bien. */
  const change = async (path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: object) => {
    setBusy(true);
    try {
      const updated = await api<DeliverableDetail>(`/api/projects/${projectId}/deliverables/${id}${path}`, { method, body });
      applied(updated);
      return true;
    } catch (error) {
      toast.error(isEditConflict(error) ? EDIT_CONFLICT_NOTICE : errorMessage(error));
      if (error instanceof ApiError && error.status === 404 && path === '') {
        void refreshList();
        onClose();
      } else {
        void query.refetch();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/api/projects/${projectId}/deliverables/${id}`, { method: 'DELETE' });
    } catch (error) {
      toast.error(errorMessage(error));
    }
    queryClient.removeQueries({ queryKey: key });
    await refreshList();
    onClose();
  };

  if (query.isPending) {
    return (
      <Modal title="Entregable" onClose={onClose} wide>
        <Loading />
      </Modal>
    );
  }
  if (query.isError) {
    return (
      <Modal title="Entregable" onClose={onClose} wide>
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      </Modal>
    );
  }

  const d = query.data;
  if (step.kind === 'edit') return <DeliverableForm projectId={projectId} item={d} onClose={() => setStep({ kind: 'view' })} />;
  if (step.kind === 'review') {
    return (
      <ReviewDialog
        projectId={projectId}
        deliverable={d}
        outcome={step.outcome}
        onDone={(updated) => {
          applied(updated);
          setStep({ kind: 'view' });
        }}
        onConflict={(message) => {
          toast.error(message);
          void query.refetch();
          void refreshList();
          setStep({ kind: 'view' });
        }}
        onClose={() => setStep({ kind: 'view' })}
      />
    );
  }
  if (step.kind === 'delete') {
    return (
      <ConfirmDialog title="Eliminar entregable" danger confirmLabel="Eliminar" onCancel={() => setStep({ kind: 'view' })} onConfirm={remove}>
        Se eliminará «{deliverableCode(d)} · {d.name}» con sus criterios y su historial de revisiones, de forma permanente.
      </ConfirmDialog>
    );
  }

  const acceptable = canAccept(d.criteria);
  const setStatus = (status: string) => void change('', 'PATCH', { status, version: d.version });

  return (
    <Modal title={`${deliverableCode(d)} · ${d.name}`} onClose={onClose} wide>
      <div className="space-y-6">
        <DetailList
          rows={[
            { label: 'Estado', value: <Badge tone={DELIVERABLE_TONE[d.status]}>{LABELS.deliverableStatus[d.status]}</Badge> },
            { label: 'Descripción', value: <RichTextView html={d.description} /> },
            { label: 'Hito', value: d.milestone?.name ?? '—' },
            { label: 'Fecha comprometida', value: d.dueDate ? `${shortDate(d.dueDate)}${d.overdue ? ' · Vencido' : ''}` : '—' },
          ]}
        />
        <CriteriaList deliverable={d} change={change} busy={busy} readOnly={readOnly} />
        <section aria-label="Trabajo">
          <h3 className="mb-2 text-sm font-semibold text-ink">Trabajo</h3>
          {d.work.length === 0 ? (
            <p className="text-sm text-ink-soft">Aún no hay tareas ligadas a este entregable</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.work.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <Link className="text-link hover:underline" to={`/proyectos/${projectId}/tareas/${t.id}`}>
                    {t.wbsCode} {t.title}
                  </Link>
                  <span className="text-ink-soft">{t.progress} %</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {d.incidents && d.incidents.length > 0 && (
          <section aria-label="Incidentes ligados">
            <h3 className="mb-2 text-sm font-semibold text-ink">Incidentes ligados</h3>
            <ul className="space-y-1 text-sm">
              {d.incidents.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <Link className="text-link hover:underline" to={`/proyectos/${projectId}/incidentes`}>
                    {`INC-${i.number} ${i.title}`}
                  </Link>
                  <span className="text-ink-soft">{`${LABELS.incidentKind[i.kind]} · ${LABELS.incidentStatus[i.status]}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!readOnly && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {d.status === 'PENDING' && (
              <Button onClick={() => setStatus('IN_REVIEW')} disabled={busy}>
                Enviar a revisión
              </Button>
            )}
            {d.status === 'IN_REVIEW' && (
              <>
                <Button onClick={() => setStep({ kind: 'review', outcome: 'ACCEPTED' })} disabled={busy || !acceptable}>
                  Aceptar
                </Button>
                <Button variant="danger" onClick={() => setStep({ kind: 'review', outcome: 'REJECTED' })} disabled={busy}>
                  Rechazar
                </Button>
              </>
            )}
            {d.status === 'REJECTED' && (
              <Button onClick={() => setStatus('IN_REVIEW')} disabled={busy}>
                Enviar a revisión
              </Button>
            )}
            {(d.status === 'IN_REVIEW' || d.status === 'REJECTED') && (
              <Button variant="secondary" onClick={() => setStatus('PENDING')} disabled={busy}>
                Volver a pendiente
              </Button>
            )}
            {d.status === 'ACCEPTED' && (
              <Button variant="secondary" onClick={() => setStatus('PENDING')} disabled={busy}>
                Reabrir
              </Button>
            )}
            <Button variant="secondary" onClick={() => setStep({ kind: 'edit' })}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => setStep({ kind: 'delete' })}>
              Eliminar
            </Button>
          </div>
          {d.status === 'IN_REVIEW' && !acceptable && <p className="text-sm text-ink-soft">Marca todos los criterios para poder aceptar</p>}
        </div>
        )}
        <ReviewHistory reviews={d.reviews} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
