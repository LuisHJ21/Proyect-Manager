import { LABELS, localToday, METRIC_DIRECTION, type MetricDirection } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { DeliverableRow, QualityMetric } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { deliverableCode, deliverablesKey } from '../deliverables/DeliverableForm';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Badge, Button, Card, EmptyState, inputClass } from '../ui';
import { shortDate } from '../../lib/display';

export const qualityKey = (projectId: string) => ['project', projectId, 'quality-metrics'];

/** «87,5» o «87.5» → 87.5; texto inválido → NaN (el servidor responde «Usa un número»). */
export const parseDecimal = (text: string) => {
  const trimmed = text.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed);
};
const number = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 4 });
const withUnit = (value: number, unit: string) => (unit ? `${number(value)} ${unit}` : number(value));

function MetricForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const deliverables = useQuery({ queryKey: [...deliverablesKey(projectId), 'list', ''], queryFn: () => api<DeliverableRow[]>(`/api/projects/${projectId}/deliverables`) });
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [direction, setDirection] = useState<MetricDirection>('HIGHER_BETTER');
  const [deliverableId, setDeliverableId] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/quality-metrics`, { method: 'POST', body: { name, unit, target: parseDecimal(target), direction, deliverableId: deliverableId || null } });
      void queryClient.invalidateQueries({ queryKey: qualityKey(projectId) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Añadir métrica" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Nombre" error={errors.fields.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Meta" error={errors.fields.target}>
            <input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </FormField>
          <FormField label="Unidad" error={errors.fields.unit} hint="Por ejemplo %, defectos o días.">
            <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Sentido" error={errors.fields.direction}>
          <select className={inputClass} value={direction} onChange={(e) => setDirection(e.target.value as MetricDirection)}>
            {METRIC_DIRECTION.map((d) => (
              <option key={d} value={d}>
                {LABELS.metricDirection[d]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Entregable (opcional)" error={errors.fields.deliverableId}>
          <select className={inputClass} value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)}>
            <option value="">De todo el proyecto</option>
            {deliverables.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {`${deliverableCode(d)} · ${d.name}`}
              </option>
            ))}
          </select>
        </FormField>
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

function MeasureForm({ projectId, metric, onClose }: { projectId: string; metric: QualityMetric; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localToday(new Date()));
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/quality-metrics/${metric.id}/measurements`, { method: 'POST', body: { date, value: parseDecimal(value), note } });
      void queryClient.invalidateQueries({ queryKey: qualityKey(projectId) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Medir ${metric.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Fecha" error={errors.fields.date}>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Valor" error={errors.fields.value} hint={`Meta: ${withUnit(metric.target, metric.unit)}`}>
            <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Nota" error={errors.fields.note}>
          <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {metric.measurements.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">Mediciones anteriores</p>
            <ul className="max-h-32 overflow-y-auto text-sm text-ink">
              {metric.measurements.map((m) => (
                <li key={m.id}>{`${shortDate(m.date)} · ${withUnit(m.value, metric.unit)}${m.note ? ` · ${m.note}` : ''}`}</li>
              ))}
            </ul>
          </div>
        )}
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

/** Métricas de calidad del proyecto: meta, último valor y si cumple. Mide y edita el PM. */
export function QualitySection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const query = useQuery({ queryKey: qualityKey(projectId), queryFn: () => api<QualityMetric[]>(`/api/projects/${projectId}/quality-metrics`) });
  const [adding, setAdding] = useState(false);
  const [measuring, setMeasuring] = useState<QualityMetric | null>(null);
  const metrics = query.data ?? [];
  return (
    <div role="region" aria-label="Calidad">
      <Card title="Calidad" actions={canEdit ? <Button variant="secondary" onClick={() => setAdding(true)}>Añadir métrica</Button> : undefined}>
        {metrics.length === 0 ? (
          <EmptyState>{query.isPending ? 'Cargando…' : 'Aún no hay métricas de calidad.'}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr>
                  <th className="py-2 pr-4 font-medium">Métrica</th>
                  <th className="py-2 pr-4 font-medium">Meta</th>
                  <th className="py-2 pr-4 font-medium">Último valor</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 text-ink">
                      {m.name}
                      {m.deliverable && <span className="block text-xs text-ink-soft">{`${deliverableCode(m.deliverable)} · ${m.deliverable.name}`}</span>}
                    </td>
                    <td className="py-2 pr-4 text-ink-nav">{`${m.direction === 'LOWER_BETTER' ? '≤' : '≥'} ${withUnit(m.target, m.unit)}`}</td>
                    <td className="py-2 pr-4 text-ink-nav">{m.latest ? `${withUnit(m.latest.value, m.unit)} · ${shortDate(m.latest.date)}` : '—'}</td>
                    <td className="py-2 pr-4">
                      {m.met === null ? <Badge>Sin medir</Badge> : m.met ? <Badge tone="success">Cumple</Badge> : <Badge tone="danger">No cumple</Badge>}
                    </td>
                    <td className="py-1 text-right">
                      {canEdit && (
                        <Button variant="ghost" aria-label={`Medir ${m.name}`} onClick={() => setMeasuring(m)}>
                          Medir
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <MetricForm projectId={projectId} onClose={() => setAdding(false)} />}
      {measuring && <MeasureForm projectId={projectId} metric={measuring} onClose={() => setMeasuring(null)} />}
    </div>
  );
}
