import { localToday } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { StatusReport, StatusReportDraft, StatusReportList } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { FormField } from '../../components/FormField';
import { StatusReportView } from '../../components/reports/StatusReportView';
import { RichTextEditor } from '../../components/richText/RichTextEditor';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

export const statusReportsKey = (projectId: string) => ['project', projectId, 'status-reports'];
const day = (iso: string) => shortDate(localToday(new Date(iso)));

/** Borrador en vivo, comentario y próximos pasos; emitir pide confirmación porque no se edita después. */
function NewReport({ projectId, onCancel }: { projectId: string; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const draft = useQuery({ queryKey: [...statusReportsKey(projectId), 'draft'], queryFn: () => api<StatusReportDraft>(`/api/projects/${projectId}/status-reports/draft`) });
  const [comment, setComment] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    setBusy(true);
    try {
      const report = await api<StatusReport>(`/api/projects/${projectId}/status-reports`, { method: 'POST', body: { comment, nextSteps } });
      void queryClient.invalidateQueries({ queryKey: statusReportsKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/proyectos/${projectId}/informes/${report.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
      setConfirming(false);
    }
  };

  if (draft.isPending) return <Loading />;
  if (draft.isError) return <ErrorState message={errorMessage(draft.error)} onRetry={() => draft.refetch()} />;
  return (
    <Card
      title="Nuevo informe"
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => setConfirming(true)}>Emitir</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <StatusReportView report={draft.data.report} period={draft.data} preview />
        <FormField label="Comentario">
          <RichTextEditor label="Comentario" value={comment} onChange={setComment} />
        </FormField>
        <FormField label="Próximos pasos">
          <RichTextEditor label="Próximos pasos" value={nextSteps} onChange={setNextSteps} />
        </FormField>
      </div>
      {confirming && (
        <ConfirmDialog title="Emitir informe" confirmLabel="Emitir" confirmDisabled={busy} onConfirm={issue} onCancel={() => setConfirming(false)}>
          <p>Una vez emitido, el informe no se puede editar</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

/** Lista de informes emitidos; el PM puede preparar uno nuevo. */
export function StatusReportsPage() {
  const { project, isPm, readOnly } = useProject();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: statusReportsKey(project.id), queryFn: () => api<StatusReportList>(`/api/projects/${project.id}/status-reports`) });

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />;
  const canIssue = isPm && !readOnly;
  return (
    <div className="space-y-6">
      {list.data.due && canIssue && (
        <p role="status" className="rounded-lg border border-warn-fg/40 bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          Toca emitir el informe de estado
        </p>
      )}
      {creating ? (
        <NewReport projectId={project.id} onCancel={() => setCreating(false)} />
      ) : (
        <Card title="Informes de estado" actions={canIssue ? <Button onClick={() => setCreating(true)}>Nuevo informe</Button> : undefined}>
          {list.data.items.length === 0 ? (
            <EmptyState>Aún no se emitió ningún informe.</EmptyState>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {list.data.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link className="font-medium text-link hover:underline" to={r.id}>{`Informe ${r.number}`}</Link>
                  <span className="text-ink-soft">{`${shortDate(r.periodStart)} – ${shortDate(r.periodEnd)} · emitido el ${day(r.issuedAt)} por ${r.issuedBy.name}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/** Un informe emitido, imprimible. */
export function StatusReportPage() {
  const { project } = useProject();
  const { reportId = '' } = useParams();
  const query = useQuery({ queryKey: [...statusReportsKey(project.id), reportId], queryFn: () => api<StatusReport>(`/api/projects/${project.id}/status-reports/${reportId}`) });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const r = query.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link className="text-sm text-link hover:underline" to={`/proyectos/${project.id}/informes`}>
          Volver a los informes
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">{`Informe ${r.number}`}</h2>
        <p className="text-sm text-ink-soft">
          {`Emitido el ${day(r.issuedAt)} por ${r.issuedBy.name}`} <Badge tone="neutral">{project.name}</Badge>
        </p>
      </div>
      <StatusReportView report={r.report} period={r} comment={r.comment} nextSteps={r.nextSteps} />
    </div>
  );
}

/** Enlace al último informe, para el resumen del proyecto. Sin informes no muestra nada. */
export function LatestReportLink({ projectId }: { projectId: string }) {
  const list = useQuery({ queryKey: statusReportsKey(projectId), queryFn: () => api<StatusReportList>(`/api/projects/${projectId}/status-reports`) });
  const latest = list.data?.items[0];
  if (!latest) return null;
  return (
    <Link className="text-sm text-link hover:underline" to={`/proyectos/${projectId}/informes/${latest.id}`}>
      {`Último informe: Informe ${latest.number} (${day(latest.issuedAt)})`}
    </Link>
  );
}
