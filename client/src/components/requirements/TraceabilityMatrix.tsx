import { LABELS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Traceability } from '../../api/types';
import { deliverableCode } from '../deliverables/DeliverableForm';
import { Badge, Card } from '../ui';
import { requirementCode, traceabilityKey } from './RequirementPicker';

/** Requisito → entregable → tareas → criterios, y los entregables que ningún requisito pide. */
export function TraceabilityMatrix({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: traceabilityKey(projectId), queryFn: () => api<Traceability>(`/api/projects/${projectId}/traceability`) });
  if (!query.data) return null;
  const { requirements, orphanDeliverables } = query.data;
  return (
    <div role="region" aria-label="Matriz de trazabilidad">
      <Card title="Matriz de trazabilidad">
        {requirements.length === 0 ? (
          <p className="text-sm text-ink-soft">Aún no hay requisitos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="p-2">Requisito</th>
                  <th className="p-2">Entregable</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Tareas terminadas</th>
                  <th className="p-2">Criterios cumplidos</th>
                </tr>
              </thead>
              <tbody>
                {requirements.flatMap((r) => {
                  const label = (
                    <td className="p-2 align-top text-ink">
                      <span className="font-medium">{requirementCode(r)}</span> {r.description}
                    </td>
                  );
                  if (r.deliverables.length === 0) {
                    return [
                      <tr key={r.id} className="border-t border-line">
                        {label}
                        <td colSpan={4} className="p-2">
                          <Badge tone="warning">Sin entregable</Badge>
                        </td>
                      </tr>,
                    ];
                  }
                  return r.deliverables.map((d, i) => (
                    <tr key={`${r.id}-${d.id}`} className={i === 0 ? 'border-t border-line' : ''}>
                      {i === 0 ? label : <td />}
                      <td className="p-2 text-ink">{`${deliverableCode(d)} · ${d.name}`}</td>
                      <td className="p-2">{LABELS.deliverableStatus[d.status]}</td>
                      <td className="p-2">{`${d.tasks.done} de ${d.tasks.total}`}</td>
                      <td className="p-2">{`${d.criteria.met} de ${d.criteria.total}`}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
        {orphanDeliverables.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-semibold text-ink">Entregables sin requisito</h3>
            <ul className="text-sm text-ink">
              {orphanDeliverables.map((d) => (
                <li key={d.id}>{`${deliverableCode(d)} · ${d.name}`}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
