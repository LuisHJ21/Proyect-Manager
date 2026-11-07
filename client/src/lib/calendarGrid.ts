import { addDays, diffDays } from '@pm/shared';
import type { CalendarMilestone, CalendarTask } from '../api/types';

export type MonthRef = { year: number; month: number };
export type CalendarEntry = ({ kind: 'task' } & CalendarTask) | ({ kind: 'milestone' } & CalendarMilestone);

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pad = (value: number) => String(value).padStart(2, '0');

/** Cuadrícula de semanas completas, de lunes a domingo. `month` va de 1 a 12. */
export function buildMonthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = `${year}-${pad(month)}-01`;
  const next = shiftMonth({ year, month }, 1);
  const last = addDays(`${next.year}-${pad(next.month)}-01`, -1);
  const mondayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  const cells = Math.ceil((diffDays(start, last) + 1) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const date = addDays(start, index);
    return { date, inMonth: date >= first && date <= last };
  });
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const monthTitle = ({ year, month }: MonthRef) => `${MONTH_NAMES[month - 1]} ${year}`;

/** Agrupa por fecha, con los hitos antes que las tareas de cada día. */
export function groupByDate(tasks: ({ kind: 'task' } & CalendarTask)[], milestones: ({ kind: 'milestone' } & CalendarMilestone)[]): Map<string, CalendarEntry[]> {
  const days = new Map<string, CalendarEntry[]>();
  for (const entry of [...milestones, ...tasks]) {
    const list = days.get(entry.dueDate) ?? [];
    list.push(entry);
    days.set(entry.dueDate, list);
  }
  return days;
}
