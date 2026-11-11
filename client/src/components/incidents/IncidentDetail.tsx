import { LABELS, type IncidentStatus } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../../api/client';
import type { Incident } from '../../api/types';
import { shortDate } from '../../lib/display';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { FormField, FormMessage } from '../FormField';
import { DetailList } from '../RegisterTable';
import { PRIORITY_TONE } from '../tasks/TaskCard';
import { useToast } from '../Toast';
import { Badge, Button, inputClass, type Tone } from '../ui';
import { IncidentForm, incidentsKey } from './IncidentForm';

export const STATUS_TONE: Record<IncidentStatus, Tone> = { OPEN: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'neutral' };
export const code = (incident: { number: number }) => `INC-${incident.number}`;

type Step = 'view' | 'edit' | 'resolve' | 'close' | 'delete';

/** Detalle de un incidente con las acciones que permite `can`. */
export function IncidentDetail({ projectId, incident, isPm, onClose }: { projectId: string; incident: Incident; isPm: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState<Step>('view');
  const [resolution, setResolution] = useState(incident.resolution);
  const [recordDecision, setRecordDecision] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: incidentsKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'decisions'] }),
    ]);

  const send = async (method: 'PATCH' | 'DELETE', body?: object) => {
    setError('');
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/incidents/${incident.id}`, { method, body });
      await refresh();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // El incidente dejó de estar visible (por ejemplo, cambió el responsable).
        toast.error('Ya no tienes acceso a este incidente');
        void refresh();
        onClose();
        return;
      }
      setError(errorMessage(err));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'edit') return <IncidentForm projectId={projectId} isPm={isPm} incident={incident} onClose={onClose} />;
  if (step === 'delete') {
    return (
      <ConfirmDialog title="Eliminar incidente" danger confirmLabel="Eliminar" onCancel={() => setStep('view')} onConfirm={() => void send('DELETE')}>
        Se eliminará «{code(incident)} · {incident.title}» de forma permanente.
      </ConfirmDialog>
    );
  }
  if (step === 'resolve') {
    return (
      <Modal title={`Resolver ${code(incident)}`} onClose={() => setStep('view')}>
        <div className="space-y-4">
          <FormMessage message={error} />
          <FormField label="Resolución">
            <textarea className={inputClass} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('view')}>
              Cancelar
            </Button>
            <Button disabled={busy || !resolution.trim()} onClick={() => void send('PATCH', { status: 'RESOLVED', resolution })}>
              Resolver
            </Button>
          </div>
        </div>
      </Modal>
    );
  }
  if (step === 'close') {
    const needsResolution = !incident.resolution.trim();
    return (
      <Modal title={`Cerrar ${code(incident)}`} onClose={() => setStep('view')}>
        <div className="space-y-4">
          <FormMessage message={error} />
          {needsResolution && (
            <FormField label="Resolución" hint="Opcional; se usa como motivo si registras la decisión.">
              <textarea className={inputClass} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </FormField>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-nav">
            <input type="checkbox" checked={recordDecision} onChange={(e) => setRecordDecision(e.target.checked)} className="h-4 w-4 accent-primary" />
            Registrar como decisión
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('view')}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void send('PATCH', {
                  status: 'CLOSED',
                  ...(needsResolution && resolution.trim() ? { resolution } : {}),
                  ...(recordDecision ? { recordDecision: true } : {}),
                })
              }
            >
              Cerrar incidente
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const { can, status } = incident;
  return (
    <Modal title={`${code(incident)} · ${incident.title}`} onClose={onClose} wide>
      <FormMessage message={error} />
      <DetailList
        rows={[
          { label: 'Estado', value: <Badge tone={STATUS_TONE[status]}>{LABELS.incidentStatus[status]}</Badge> },
          { label: 'Prioridad', value: <Badge tone={PRIORITY_TONE[incident.priority]}>{LABELS.priority[incident.priority]}</Badge> },
          { label: 'Responsable', value: incident.owner?.name ?? 'Sin responsable' },
          {
            label: 'Fecha límite',
            value: incident.dueDate ? (
              <span className="flex items-center gap-2">
                {shortDate(incident.dueDate)}
                {incident.overdue && <Badge tone="danger">Vencido</Badge>}
              </span>
            ) : (
              '—'
            ),
          },
          { label: 'Reportado por', value: `${incident.reportedBy.name}, el ${new Date(incident.createdAt).toLocaleDateString('es')}` },
          { label: 'Descripción', value: incident.description || '—' },
          { label: 'Tarea', value: incident.task ? <Link className="text-link underline" to={`/proyectos/${projectId}/tareas/${incident.task.id}`}>{incident.task.title}</Link> : '—' },
          ...(isPm ? [{ label: 'Riesgo de origen', value: incident.risk ? incident.risk.title : '—' }] : []),
          ...(incident.resolution ? [{ label: 'Resolución', value: incident.resolution }] : []),
        ]}
      />
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {can.changeStatus && status === 'OPEN' && (
          <Button variant="secondary" disabled={busy} onClick={() => void send('PATCH', { status: 'IN_PROGRESS' })}>
            Marcar en curso
          </Button>
        )}
        {can.changeStatus && status !== 'RESOLVED' && status !== 'CLOSED' && (
          <Button variant="secondary" onClick={() => setStep('resolve')}>
            Resolver
          </Button>
        )}
        {can.edit && (
          <Button variant="secondary" onClick={() => setStep('edit')}>
            Editar
          </Button>
        )}
        {can.close && status !== 'CLOSED' && <Button onClick={() => setStep('close')}>Cerrar</Button>}
        {can.close && status === 'CLOSED' && (
          <Button variant="secondary" disabled={busy} onClick={() => void send('PATCH', { status: 'OPEN' })}>
            Reabrir
          </Button>
        )}
        {can.edit && (
          <Button variant="ghost" onClick={() => setStep('delete')}>
            Eliminar
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Volver
        </Button>
      </div>
    </Modal>
  );
}
