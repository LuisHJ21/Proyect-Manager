import { INCIDENT_STATUS, LABELS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Incident } from '../../api/types';
import { ErrorState, Loading } from '../../components/ErrorState';
import { code, IncidentDetail, STATUS_TONE } from '../../components/incidents/IncidentDetail';
import { IncidentForm, incidentsKey } from '../../components/incidents/IncidentForm';
import { PRIORITY_TONE } from '../../components/tasks/TaskCard';
import { Badge, Button, Card, EmptyState, inputClass } from '../../components/ui';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

/** Registro de incidentes del proyecto. El colaborador ve los que reportó o tiene asignados. */
export function IncidentsPage() {
  const { project, isPm, readOnly } = useProject();
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (isPm && mine) params.set('mine', '1');
  const query = params.toString();
  const list = useQuery({
    queryKey: [...incidentsKey(project.id), status, isPm && mine],
    queryFn: () => api<Incident[]>(`/api/projects/${project.id}/incidents${query ? `?${query}` : ''}`),
  });
  const viewing = list.data?.find((i) => i.id === viewingId) ?? null;

  return (
    <Card title="Incidentes" actions={readOnly ? undefined : <Button variant="secondary" onClick={() => setReporting(true)}>Reportar incidente</Button>}>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Estado</span>
          <select aria-label="Estado" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {INCIDENT_STATUS.map((s) => (
              <option key={s} value={s}>
                {LABELS.incidentStatus[s]}
              </option>
            ))}
          </select>
        </label>
        {isPm && (
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-nav">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-primary" />
            Míos
          </label>
        )}
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>No hay incidentes.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                {['Número', 'Incidente', 'Prioridad', 'Responsable', 'Fecha límite', 'Estado'].map((h) => (
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
              {list.data.map((incident) => (
                <tr key={incident.id}>
                  <td className="py-2 pr-4 font-medium whitespace-nowrap text-ink">{code(incident)}</td>
                  <td className="min-w-40 py-2 pr-4 text-ink [overflow-wrap:break-word]">{incident.title}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={PRIORITY_TONE[incident.priority]}>{LABELS.priority[incident.priority]}</Badge>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{incident.owner?.name ?? 'Sin responsable'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">
                    {incident.dueDate ? shortDate(incident.dueDate) : '—'}
                    {incident.overdue && (
                      <span className="ml-2">
                        <Badge tone="danger">Vencido</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={STATUS_TONE[incident.status]}>{LABELS.incidentStatus[incident.status]}</Badge>
                  </td>
                  <td className="py-1 text-right">
                    <Button variant="ghost" aria-label={`Ver ${code(incident)}`} onClick={() => setViewingId(incident.id)}>
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reporting && <IncidentForm projectId={project.id} isPm={isPm} onClose={() => setReporting(false)} />}
      {viewing && <IncidentDetail projectId={project.id} incident={viewing} isPm={isPm} readOnly={readOnly} onClose={() => setViewingId(null)} />}
    </Card>
  );
}
