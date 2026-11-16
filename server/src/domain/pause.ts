import { addDays, diffDays } from '@pm/shared';
import { weekStart, weeklyLoad, type LoadTask } from './workload';

/** Máximo de días que se corre un cronograma al reanudar (igual que el esquema). */
export const MAX_RESUME_DAYS = 365;
/** Semana actual y las 3 siguientes, como la carga del panel. */
const IMPACT_WEEKS = 4;

export type ShiftTask = { id: string; title: string; status: string; startDate: string | null; dueDate: string | null };
type Dates = { startDate: string | null; dueDate: string | null };
export type DateChange = { id: string; name: string; from: Dates; to: Dates };
export type ShiftPlan = {
  tasks: DateChange[];
  milestones: { id: string; name: string; from: string; to: string }[];
  endDate: { from: string; to: string } | null;
};

/**
 * Corrimiento al reanudar (días corridos). Recibe solo tareas hoja. Las que no empezaron (`TODO`,
 * `BLOCKED`) mueven inicio y fin aunque su inicio ya haya pasado; las `IN_PROGRESS` solo el fin;
 * las terminadas y las que no tienen las dos fechas no se tocan. Hitos pendientes y fin del proyecto
 * se mueven lo mismo.
 */
export function planShift(input: { tasks: ShiftTask[]; milestones: { id: string; name: string; dueDate: string; status: string }[]; endDate: string | null }, days: number): ShiftPlan {
  if (days === 0) return { tasks: [], milestones: [], endDate: null };
  const tasks: DateChange[] = [];
  for (const t of input.tasks) {
    if (!t.startDate || !t.dueDate || t.status === 'DONE') continue;
    const started = t.status === 'IN_PROGRESS';
    tasks.push({
      id: t.id,
      name: t.title,
      from: { startDate: t.startDate, dueDate: t.dueDate },
      to: { startDate: started ? t.startDate : addDays(t.startDate, days), dueDate: addDays(t.dueDate, days) },
    });
  }
  return {
    tasks,
    milestones: input.milestones.filter((m) => m.status === 'PENDING').map((m) => ({ id: m.id, name: m.name, from: m.dueDate, to: addDays(m.dueDate, days) })),
    endDate: input.endDate ? { from: input.endDate, to: addDays(input.endDate, days) } : null,
  };
}

/** Días corridos desde la pausa hasta hoy, de 0 a 365. Sin fecha de pausa (proyectos anteriores), 0. */
export function proposedResumeDays(pausedOn: string | null, today: string): number {
  if (!pausedOn) return 0;
  return Math.min(MAX_RESUME_DAYS, Math.max(0, diffDays(pausedOn, today)));
}

export type PauseImpact = { userId: string; name: string; hours: { projectId: string; total: number }[] };

/** Personas de ambos proyectos y sus horas asignadas en cada uno en las próximas 4 semanas. */
export function pauseImpact(
  input: { members: { userId: string; name: string; projectIds: string[] }[]; tasks: (LoadTask & { projectId: string })[] },
  projectId: string,
  priorityProjectId: string,
  today: string,
): PauseImpact[] {
  const shared = input.members.filter((m) => m.projectIds.includes(projectId) && m.projectIds.includes(priorityProjectId));
  if (shared.length === 0) return [];
  const weeks = Array.from({ length: IMPACT_WEEKS }, (_, i) => addDays(weekStart(today), i * 7));
  const totals = (id: string) => {
    const load = weeklyLoad(input.tasks.filter((t) => t.projectId === id), weeks);
    return (userId: string) => Math.round((load.get(userId) ?? []).reduce((sum, h) => sum + h, 0) * 10) / 10;
  };
  const own = totals(projectId);
  const priority = totals(priorityProjectId);
  return shared.map((m) => ({
    userId: m.userId,
    name: m.name,
    hours: [
      { projectId, total: own(m.userId) },
      { projectId: priorityProjectId, total: priority(m.userId) },
    ],
  }));
}
