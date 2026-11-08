import { formatMoney } from '@pm/shared';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Performance } from '../../api/types';
import { shortDate } from '../../lib/display';

type Point = Performance['series'][number];
type Key = 'pvCents' | 'evCents' | 'acCents';

const SERIES: { key: Key; label: string; color: string; dash?: string }[] = [
  { key: 'pvCents', label: 'Valor planeado (PV)', color: 'var(--color-series-pv)', dash: '6 4' },
  { key: 'evCents', label: 'Valor ganado (EV)', color: 'var(--color-series-ev)' },
  { key: 'acCents', label: 'Costo real (AC)', color: 'var(--color-series-ac)' },
];

const DEFAULT_WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 12, right: 16, bottom: 28, left: 72 };

const compact = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);
  } catch {
    return formatMoney(cents, currency);
  }
};

/** Curva S: valor planeado, valor ganado y costo real a lo largo del tiempo. */
export function SCurve({ series, today, currency }: { series: Point[]; today: string; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // El viewBox sigue al ancho real de la caja para que el texto conserve su tamaño en móvil.
  const box = useRef<HTMLDivElement>(null);
  const [WIDTH, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry!.contentRect.width);
      if (width > 0) setWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (series.length === 0) return null;

  const max = Math.max(1, ...series.flatMap((p) => [p.pvCents, p.evCents ?? 0, p.acCents ?? 0]));
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (cents: number) => PAD.top + innerH - (cents / max) * innerH;
  const todayIndex = series.findIndex((p) => p.date === today);
  const current = series[todayIndex >= 0 ? todayIndex : series.length - 1]!;
  const money = (cents: number | null) => (cents === null ? 'sin dato' : formatMoney(cents, currency));

  // Une los puntos con valor; los días sin foto no cortan la línea.
  const path = (key: Key) =>
    series
      .map((p, i) => ({ value: p[key], i }))
      .filter((p): p is { value: number; i: number } => p.value !== null)
      .map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (svgX - PAD.left) / innerW;
    setHover(Math.min(series.length - 1, Math.max(0, Math.round(ratio * (series.length - 1)))));
  };

  const label = `Curva S al ${shortDate(current.date)}: Valor planeado ${money(current.pvCents)}, valor ganado ${money(current.evCents)}, costo real ${money(current.acCents)}.`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const hovered = hover === null ? null : series[hover]!;

  return (
    <div>
      <ul aria-label="Leyenda de la curva" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-nav">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} strokeLinecap="round" />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-ink-soft)">
                {compact(t, currency)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={HEIGHT - 8} fontSize="11" fill="var(--color-ink-soft)">
            {shortDate(series[0]!.date)}
          </text>
          <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">
            {shortDate(series.at(-1)!.date)}
          </text>
          {todayIndex >= 0 && (
            <g>
              <line x1={x(todayIndex)} x2={x(todayIndex)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-ink-soft)" strokeWidth="1" strokeDasharray="2 3" />
              <text x={x(todayIndex)} y={PAD.top + 10} textAnchor="middle" fontSize="11" fill="var(--color-ink-nav)" stroke="var(--color-surface)" strokeWidth="3" paintOrder="stroke">
                Hoy
              </text>
            </g>
          )}
          {SERIES.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* Cada día con foto lleva un punto: con una sola foto la línea no se vería. */}
          {SERIES.filter((s) => s.key !== 'pvCents').map((s) =>
            series.map((p, i) =>
              p[s.key] === null ? null : (
                <circle key={`${s.key}-${p.date}`} data-series={s.key} cx={x(i)} cy={y(p[s.key]!)} r="4" fill={s.color} stroke="var(--color-surface)" strokeWidth="2" />
              ),
            ),
          )}
          {hovered && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-control)" strokeWidth="1" />
              {SERIES.map((s) =>
                hovered[s.key] === null ? null : (
                  <circle key={s.key} cx={x(hover!)} cy={y(hovered[s.key]!)} r="4" fill={s.color} stroke="var(--color-surface)" strokeWidth="2" />
                ),
              )}
            </g>
          )}
        </svg>
        {hovered && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-lg"
            style={hover! / Math.max(1, series.length - 1) > 0.6 ? { left: 8 } : { right: 8 }}
          >
            <p className="mb-1 font-semibold text-ink">{shortDate(hovered.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex justify-between gap-3 text-ink-nav">
                <span>{s.label}</span>
                <span className="text-ink">{money(hovered[s.key])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
