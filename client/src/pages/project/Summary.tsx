import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Flag, Network, SquareCheckBig } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { Indicators, Project, ProjectPauseEntry } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormField } from '../../components/FormField';
import { IndicatorCards } from '../../components/project/IndicatorCards';
import { MembersPanel } from '../../components/project/MembersPanel';
import { MilestoneTrend } from '../../components/project/MilestoneTrend';
import { MilestonesPanel, ObjectivesPanel } from '../../components/project/PlanningPanels';
import { ProjectForm } from '../../components/project/ProjectForm';
import { RichTextView } from '../../components/richText/RichTextView';
import { useToast } from '../../components/Toast';
import { Button, Card, inputClass } from '../../components/ui';
import { LABELS } from '@pm/shared';
import { useAccess } from '../../auth/useAccess';
import { projectKey, useProject } from './ProjectLayout';
import { LatestReportLink, statusReportsKey } from './StatusReports';
import { shortDate } from '../../lib/display';

function DeleteProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmName, setConfirmName] = useState('');
  const remove = useMutation({
    mutationFn: () => api(`/api/projects/${project.id}`, { method: 'DELETE', body: { confirmName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['project', project.id] });
      navigate('/proyectos');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <ConfirmDialog
      title="Eliminar proyecto"
      danger
      confirmLabel="Eliminar definitivamente"
      confirmDisabled={confirmName !== project.name || remove.isPending}
      onCancel={onClose}
      onConfirm={() => remove.mutate()}
    >
      <p>Se borrarán de forma permanente sus tareas, anexos y demás datos. Esta acción no se puede deshacer.</p>
      <FormField label="Nombre del proyecto" hint={`Escribe «${project.name}» para confirmar`}>
        <input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
      </FormField>
    </ConfirmDialog>
  );
}

/** Historial de pausas del proyecto (etapa 8), solo para el PM; oculto si nunca se pausó. */
function PauseHistory({ projectId }: { projectId: string }) {
  const pauses = useQuery({ queryKey: ['project', projectId, 'pauses'], queryFn: () => api<ProjectPauseEntry[]>(`/api/projects/${projectId}/pauses`) });
  if (!pauses.data || pauses.data.length === 0) return null;
  return (
    <div role="region" aria-label="Pausas">
      <Card title="Pausas">
        <ul className="divide-y divide-line text-sm">
          {pauses.data.map((p, i) => (
            <li key={i} className="grid min-w-0 gap-1 py-2 xl:grid-cols-[10rem_minmax(0,1fr)_10rem_6rem] xl:gap-3">
              <span className="text-ink-nav">{`${p.pausedOn ? shortDate(p.pausedOn) : '—'} → ${p.resumedOn ? shortDate(p.resumedOn) : 'en curso'}`}</span>
              <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{p.reason || '—'}</span>
              <span className="min-w-0 text-ink-nav [overflow-wrap:anywhere]">{p.priorityProject?.name ?? '—'}</span>
              <span className="text-ink-nav">{p.shiftDays === null ? '—' : `${p.shiftDays} días`}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function SummaryPage() {
  const { project, isPm, readOnly } = useProject();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { canRead } = useAccess();
  const indicators = useQuery({
    queryKey: ['project', project.id, 'indicators'],
    queryFn: () => api<Indicators>(`/api/projects/${project.id}/indicators`),
  });

  return (
    <div className="space-y-6">
      <section aria-label="Accesos del proyecto" className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-wide text-link uppercase">Espacio del proyecto</p><h2 className="mt-1 text-2xl font-semibold text-ink">Planifica y sigue el trabajo</h2><p className="mt-1 text-sm text-ink-soft">Abre la estructura, revisa el calendario o continúa con las tareas.</p></div>
          {indicators.data && <div className="rounded-xl border border-line bg-raised px-4 py-3 text-right"><span className="text-xs text-ink-soft">Avance general</span><p className="text-2xl font-bold text-ink">{indicators.data.progress} %</p></div>}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { to: 'edt', title: 'EDT', note: 'Estructura del trabajo', Icon: Network },
            { to: 'cronograma', title: 'Cronograma', note: 'Fechas y dependencias', Icon: CalendarDays },
            { to: 'tareas', title: 'Tareas', note: 'Avance del equipo', Icon: SquareCheckBig },
            { to: 'hitos', title: 'Hitos', note: 'Puntos de control', Icon: Flag },
          ].map(({ to, title, note, Icon }) => <Link key={to} to={`/proyectos/${project.id}/${to}`} className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-raised p-3 text-ink transition-colors hover:border-link hover:bg-active"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-active text-link"><Icon size={20} aria-hidden="true" /></span><span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-xs text-ink-soft">{note}</span></span></Link>)}
        </div>
      </section>
      <IndicatorCards query={indicators} currency={project.currency} />
      {/* Pantallas anchas: dos columnas; angostas, una sola. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div role="region" aria-label="Columna principal" className="min-w-0 space-y-6">
          <MilestoneTrend projectId={project.id} />
          <MilestonesPanel projectId={project.id} canEdit={isPm && !readOnly} />
          <ObjectivesPanel projectId={project.id} canEdit={isPm && !readOnly} />
        </div>
        <div role="region" aria-label="Columna lateral" className="min-w-0 space-y-6">
          <Card
            title="Acerca del proyecto"
            actions={
              isPm ? (
                <div className="flex flex-wrap gap-2">
                  {!readOnly && (
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                      Editar proyecto
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDeleting(true)}>
                    Eliminar proyecto
                  </Button>
                </div>
              ) : undefined
            }
          >
            <RichTextView html={project.description} empty="Sin descripción." />
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-soft">Enfoque</dt>
              <dd className="text-ink">{LABELS.approach[project.approach]}</dd>
              <dt className="text-ink-soft">Inicio</dt>
              <dd className="text-ink">{project.startDate ?? '—'}</dd>
              <dt className="text-ink-soft">Fin</dt>
              <dd className="text-ink">{project.endDate ?? '—'}</dd>
            </dl>
            {canRead('reports') && (
              <div className="mt-4">
                <LatestReportLink projectId={project.id} />
              </div>
            )}
          </Card>
          <MembersPanel projectId={project.id} canEdit={isPm && !readOnly} />
          {isPm && <PauseHistory projectId={project.id} />}
        </div>
      </div>
      {editing && (
        <ProjectForm
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: projectKey(project.id) });
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            void queryClient.invalidateQueries({ queryKey: ['project', project.id, 'indicators'] });
            void queryClient.invalidateQueries({ queryKey: statusReportsKey(project.id) });
            void queryClient.invalidateQueries({ queryKey: ['project', project.id, 'milestone-trend'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setEditing(false);
          }}
        />
      )}
      {deleting && <DeleteProjectDialog project={project} onClose={() => setDeleting(false)} />}
    </div>
  );
}
