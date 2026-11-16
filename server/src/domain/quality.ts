export type MetricMeasurement = { date: string; value: number; createdAt: Date };

/** Último valor (fecha más reciente; si empatan, el último registrado) y si cumple la meta. */
export function metricStatus(metric: { target: number; direction: string }, measurements: MetricMeasurement[]): { latest: { date: string; value: number } | null; met: boolean | null } {
  const last = [...measurements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!last) return { latest: null, met: null };
  const met = metric.direction === 'LOWER_BETTER' ? last.value <= metric.target : last.value >= metric.target;
  return { latest: { date: last.date, value: last.value }, met };
}
