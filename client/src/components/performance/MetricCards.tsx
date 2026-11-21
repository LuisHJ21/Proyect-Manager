import { formatMoney } from '@pm/shared';
import type { ReactNode } from 'react';
import type { Performance } from '../../api/types';
import { cpiLabel, formatIndex, indexTone, spiLabel } from '../../lib/evmDisplay';
import { Badge } from '../ui';

function MetricCard({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div data-card className="min-w-0 rounded-lg border border-line bg-surface p-4 [overflow-wrap:anywhere]">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {note && <div className="mt-1.5 text-xs text-ink-soft">{note}</div>}
    </div>
  );
}

function IndexNote({ value, label }: { value: number | null; label: string | null }) {
  const tone = indexTone(value);
  if (!tone || !label) return <span>Sin datos todavía</span>;
  return <Badge tone={tone}>{label}</Badge>;
}

/** Tarjetas con los indicadores principales del valor ganado. */
export function MetricCards({ metrics, currency }: { metrics: NonNullable<Performance['metrics']>; currency: string }) {
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <section aria-label="Indicadores de valor ganado" className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="CPI · eficiencia de costo" value={formatIndex(metrics.cpi)} note={<IndexNote value={metrics.cpi} label={cpiLabel(metrics.cpi)} />} />
      <MetricCard label="SPI · eficiencia de plazo" value={formatIndex(metrics.spi)} note={<IndexNote value={metrics.spi} label={spiLabel(metrics.spi)} />} />
      <MetricCard
        label="TCPI · rendimiento necesario"
        value={formatIndex(metrics.tcpi ?? null)}
        note={metrics.tcpi == null ? 'Ya se gastó el presupuesto de la línea base' : `Necesitas rendir ${formatIndex(metrics.tcpi)} por cada unidad que falta gastar`}
      />
      <MetricCard label="% completado" value={`${metrics.percentComplete} %`} note={`Valor ganado ${money(metrics.evCents)} de ${money(metrics.bacCents)}`} />
      <MetricCard
        label="EAC · costo final estimado"
        value={money(metrics.eacCents)}
        note={
          <>
            {metrics.eacMethod === 'ATYPICAL' && <p>Estimación: aún no hay avance que permita proyectar el costo</p>}
            <p>{`Falta por gastar ${money(metrics.etcCents)}`}</p>
          </>
        }
      />
      <MetricCard
        label="VAC · variación al terminar"
        value={money(metrics.vacCents)}
        note={metrics.vacCents < 0 ? 'Se espera terminar por encima del presupuesto planeado' : 'Se espera terminar dentro del presupuesto planeado'}
      />
      <MetricCard label="Contingencia" value={money(metrics.contingencyCents)} note={`Uso proyectado ${money(metrics.contingencyUseCents)}`} />
    </section>
  );
}
