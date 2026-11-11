import { LABELS, localToday, type ClosurePendingKind } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { ClosureState } from '../../api/types';
import { closureKey, CloseProjectDialog } from '../../components/closure/CloseProjectDialog';
import { ClosureReportView } from '../../components/closure/ClosureReportView';
import { ErrorState, Loading } from '../../components/ErrorState';
import { RichTextView } from '../../components/richText/RichTextView';
import { Button, Card } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

const PENDING_TAB: Record<ClosurePendingKind, string> = {
  deliverables: 'entregables',
  incidents: 'incidentes',
  risks: 'riesgos',
  tasks: 'tareas',
  objectives: 'resumen',
  charter: 'acta',
};

const day = (iso: string) => shortDate(localToday(new Date(iso)));

/** Cierre del proyecto: pendientes, informe final (en vivo o congelado) e historial. Solo para el PM. */
export function ClosurePage() {
  const { project } = useProject();
  const query = useQuery({ queryKey: closureKey(project.id), queryFn: () => api<ClosureState>(`/api/projects/${project.id}/closure`) });
  const [closing, setClosing] = useState(false);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const state = query.data;
  const isOpen = state.status === 'open';

  return (
    <div className="space-y-6">
      {isOpen ? (
        <div role="region" aria-label="Pendientes">
          <Card title="Pendientes" actions={<Button onClick={() => setClosing(true)}>Cerrar proyecto</Button>}>
            {state.report.pendings.length === 0 ? (
              <p className="text-sm text-ink-nav">Sin pendientes</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {state.report.pendings.map((p) => (
                  <li key={p.kind}>
                    <Link className="text-link hover:underline" to={`/proyectos/${project.id}/${PENDING_TAB[p.kind]}`}>
                      {LABELS.closurePending[p.kind]}
                    </Link>
                    <span className="text-ink-soft">{` · ${p.count}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card
          title="Cierre"
          actions={
            <Button variant="secondary" data-print-hide onClick={() => window.print()}>
              Imprimir informe
            </Button>
          }
        >
          {state.legacy ? (
            <p className="text-sm text-ink-nav">Cerrado antes del registro de cierres</p>
          ) : (
            state.current && (
              <div className="space-y-3 text-sm">
                <p className="text-ink-nav">
                  {`${LABELS.projectStatus[state.current.finalStatus]} el ${day(state.current.closedAt)} por ${state.current.closedBy.name}`}
                </p>
                <RichTextView html={state.current.summary} empty="Sin resumen." />
                {state.current.pendingReason && (
                  <p className="text-ink">
                    <span className="text-ink-soft">Motivo de los pendientes: </span>
                    {state.current.pendingReason}
                  </p>
                )}
              </div>
            )
          )}
        </Card>
      )}
      <Card title="Informe de cierre">
        <ClosureReportView report={state.report} preview={isOpen || state.legacy} />
      </Card>
      {state.history.length > 0 && (
        <div role="region" aria-label="Historial de cierre" data-print-hide>
          <Card title="Historial de cierre">
            <ul className="space-y-2 text-sm">
              {state.history.map((h) => (
                <li key={h.id} className="text-ink-nav">
                  <p>{`${LABELS.projectStatus[h.finalStatus]} el ${day(h.closedAt)} por ${h.closedBy.name}`}</p>
                  {h.reopenedAt && <p>{`Reabierto el ${day(h.reopenedAt)} por ${h.reopenedBy?.name ?? '—'}: ${h.reopenReason}`}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {closing && <CloseProjectDialog projectId={project.id} report={state.report} onClose={() => setClosing(false)} />}
    </div>
  );
}
