import { diffDays } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { MilestoneTrendItem } from '../../api/types';
import { shortDate, signedDays } from '../../lib/display';
import { PROJECT_COLORS } from '../../lib/display';
import { Badge, Card } from '../ui';

const W = 560;
const H = 180;
const PAD = 32;

/** Gráfico propio: una línea por hito con su pronóstico diario; la fecha prevista como línea punteada. */
function TrendChart({ items }: { items: MilestoneTrendItem[] }) {
  const drawn = items.filter((m) => m.history.length > 0);
  if (drawn.length === 0) return <p className="text-sm text-ink-soft">El historial aparece desde el día siguiente al primer pronóstico.</p>;
  const days = drawn.flatMap((m) => m.history.map((h) => h.date)).sort();
  const values = drawn.flatMap((m) => [m.dueDate, ...m.history.map((h) => h.forecastDate)]).sort();
  const x0 = days[0]!;
  const xSpan = Math.max(1, diffDays(x0, days.at(-1)!));
  const y0 = values[0]!;
  const ySpan = Math.max(1, diffDays(y0, values.at(-1)!));
  const x = (d: string) => PAD + (diffDays(x0, d) / xSpan) * (W - 2 * PAD);
  const y = (d: string) => H - PAD - (diffDays(y0, d) / ySpan) * (H - 2 * PAD);
  return (
    <svg role="img" aria-label="Tendencia de hitos" viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-line" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="stroke-line" />
      <text x={PAD} y={H - 8} className="fill-ink-soft text-[10px]">{shortDate(x0)}</text>
      <text x={W - PAD} y={H - 8} textAnchor="end" className="fill-ink-soft text-[10px]">{shortDate(days.at(-1)!)}</text>
      {drawn.map((m, index) => {
        const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
        const points = m.history.map((h) => `${x(h.date)},${y(h.forecastDate)}`).join(' ');
        return (
          <g key={m.id}>
            <line x1={PAD} x2={W - PAD} y1={y(m.dueDate)} y2={y(m.dueDate)} stroke={color} strokeDasharray="4 4" strokeOpacity={0.6} />
            <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
            <text x={W - PAD + 2} y={y(m.history.at(-1)!.forecastDate)} className="text-[10px]" fill={color}>
              {m.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tendencia de hitos (F16): prevista frente a pronosticada, desvío y cómo se movió el pronóstico. */
export function MilestoneTrend({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ['project', projectId, 'milestone-trend'], queryFn: () => api<MilestoneTrendItem[]>(`/api/projects/${projectId}/milestone-trend`) });
  const items = query.data ?? [];
  if (items.length === 0) return null;
  return (
    <div role="region" aria-label="Tendencia de hitos">
      <Card title="Tendencia de hitos">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-soft">
              <tr>
                <th className="py-2 pr-4 font-medium">Hito</th>
                <th className="py-2 pr-4 font-medium">Prevista</th>
                <th className="py-2 pr-4 font-medium">Pronosticada</th>
                <th className="py-2 font-medium">Desvío</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4 text-ink">{m.name}</td>
                  <td className="py-2 pr-4 text-ink-nav">{shortDate(m.dueDate)}</td>
                  <td className="py-2 pr-4 text-ink-nav">{m.status === 'REACHED' ? <Badge tone="success">Alcanzado</Badge> : shortDate(m.forecastDate)}</td>
                  <td className={`py-2 ${m.slipDays && m.slipDays > 0 ? 'text-danger' : 'text-ink-nav'}`}>{m.slipDays === null ? '—' : signedDays(m.slipDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <TrendChart items={items.filter((m) => m.status !== 'REACHED')} />
        </div>
      </Card>
    </div>
  );
}
