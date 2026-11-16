import type { AgreementTarget } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Meeting, MeetingAgreement, MeetingSummary } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { decisionsKey } from '../../components/decisions/DecisionsCard';
import { ErrorState, Loading } from '../../components/ErrorState';
import { incidentsKey } from '../../components/incidents/IncidentForm';
import { MeetingForm } from '../../components/meetings/MeetingForm';
import { RichTextView } from '../../components/richText/RichTextView';
import { refreshTaskData } from '../../components/tasks/taskQueries';
import { useToast } from '../../components/Toast';
import { Button, Card, EmptyState } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

export const meetingsKey = (projectId: string) => ['project', projectId, 'meetings'];

const CONVERT: { kind: AgreementTarget; label: string }[] = [
  { kind: 'task', label: 'Crear tarea' },
  { kind: 'decision', label: 'Registrar decisión' },
  { kind: 'incident', label: 'Registrar incidente' },
];
const CONVERTED_LABEL: Record<AgreementTarget, string> = { task: 'Convertido en tarea', decision: 'Convertido en decisión', incident: 'Convertido en incidente' };

/** Lista de actas; el colaborador ve solo las reuniones a las que asistió. */
export function MeetingsPage() {
  const { project, isPm, readOnly } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: meetingsKey(project.id), queryFn: () => api<MeetingSummary[]>(`/api/projects/${project.id}/meetings`) });

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />;
  return (
    <>
      <Card title="Reuniones" actions={isPm && !readOnly ? <Button onClick={() => setCreating(true)}>Nueva reunión</Button> : undefined}>
        {list.data.length === 0 ? (
          <EmptyState>{isPm ? 'Aún no hay actas de reunión.' : 'Aún no hay actas de reuniones a las que asististe.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {list.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="font-medium text-link hover:underline" to={m.id}>
                  {m.title}
                </Link>
                <span className="text-ink-soft">{`${shortDate(m.date)} · ${m.attendeeCount} asistentes · ${m.agreementCount} acuerdos`}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && (
        <MeetingForm
          projectId={project.id}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: meetingsKey(project.id) });
            navigate(`/proyectos/${project.id}/reuniones/${saved.id}`);
          }}
        />
      )}
    </>
  );
}

function convertedLink(projectId: string, a: MeetingAgreement) {
  if (a.taskId) return { to: `/proyectos/${projectId}/tareas/${a.taskId}`, label: 'Ver tarea' };
  if (a.decisionId) return { to: `/proyectos/${projectId}/cambios`, label: 'Ver decisión' };
  if (a.incidentId) return { to: `/proyectos/${projectId}/incidentes`, label: 'Ver incidente' };
  return null;
}

function AgreementRow({ projectId, meetingId, agreement, canConvert }: { projectId: string; meetingId: string; agreement: MeetingAgreement; canConvert: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = convertedLink(projectId, agreement);

  const convert = async (kind: AgreementTarget) => {
    setBusy(true);
    try {
      await api<MeetingAgreement>(`/api/projects/${projectId}/meetings/${meetingId}/agreements/${agreement.id}/convert`, { method: 'POST', body: { kind } });
      await queryClient.invalidateQueries({ queryKey: [...meetingsKey(projectId), meetingId] });
      if (kind === 'task') void refreshTaskData(queryClient, projectId);
      if (kind === 'decision') void queryClient.invalidateQueries({ queryKey: decisionsKey(projectId) });
      if (kind === 'incident') void queryClient.invalidateQueries({ queryKey: incidentsKey(projectId) });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div>
        <p className="text-ink">{agreement.text}</p>
        <p className="text-xs text-ink-soft">{[agreement.owner?.name, agreement.dueDate ? shortDate(agreement.dueDate) : null].filter(Boolean).join(' · ') || 'Sin responsable ni fecha'}</p>
      </div>
      {agreement.convertedTo ? (
        link ? (
          <Link className="text-sm text-link hover:underline" to={link.to}>
            {link.label}
          </Link>
        ) : (
          <span className="text-sm text-ink-soft">{CONVERTED_LABEL[agreement.convertedTo]}</span>
        )
      ) : (
        canConvert && (
          <div className="flex flex-wrap gap-1">
            {CONVERT.map(({ kind, label }) => (
              <Button key={kind} variant="secondary" disabled={busy} onClick={() => void convert(kind)}>
                {label}
              </Button>
            ))}
          </div>
        )
      )}
    </li>
  );
}

/** Un acta: asistentes, notas y acuerdos. */
export function MeetingPage() {
  const { project, isPm, readOnly } = useProject();
  const { meetingId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const key = [...meetingsKey(project.id), meetingId];
  const query = useQuery({ queryKey: key, queryFn: () => api<Meeting>(`/api/projects/${project.id}/meetings/${meetingId}`) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const m = query.data;
  const canEdit = isPm && !readOnly;
  const attendees = [...m.attendees.users, ...m.attendees.stakeholders];

  const remove = async () => {
    try {
      await api(`/api/projects/${project.id}/meetings/${m.id}`, { method: 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: meetingsKey(project.id) });
      navigate(`/proyectos/${project.id}/reuniones`);
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="text-sm text-link hover:underline" to={`/proyectos/${project.id}/reuniones`}>
          Volver a las reuniones
        </Link>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Eliminar
            </Button>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">{m.title}</h2>
        <p className="text-sm text-ink-soft">{shortDate(m.date)}</p>
      </div>
      <Card title="Asistentes">
        {attendees.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin asistentes registrados.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
            {attendees.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Notas">
        <RichTextView html={m.notes} empty="Sin notas." />
      </Card>
      <Card title="Acuerdos">
        {m.agreements.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin acuerdos.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {m.agreements.map((a) => (
              <AgreementRow key={a.id} projectId={project.id} meetingId={m.id} agreement={a} canConvert={canEdit} />
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <MeetingForm
          projectId={project.id}
          meeting={m}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: meetingsKey(project.id) });
            setEditing(false);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog title="Eliminar reunión" danger confirmLabel="Eliminar" onConfirm={() => void remove()} onCancel={() => setDeleting(false)}>
          <p>Se borra el acta. Las tareas, decisiones e incidentes creados desde sus acuerdos se conservan.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
