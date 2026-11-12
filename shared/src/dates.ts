const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/**
 * Fecha de calendario del instante dado, en formato YYYY-MM-DD.
 * Con `timeZone` (por ejemplo `America/Lima`) se calcula en esa zona; sin ella, en la del sistema.
 */
export function localToday(now: Date, timeZone?: string): string {
  if (timeZone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function isValidCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return new Date(toUtcMs(date)).toISOString().slice(0, 10) === date;
}
