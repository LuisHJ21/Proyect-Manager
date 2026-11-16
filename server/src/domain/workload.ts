import { addDays, diffDays } from '@pm/shared';

export type LoadTask = { status: string; startDate: string | null; dueDate: string | null; estimatedHours: number | null; assigneeIds: string[] };

/** Lunes de la semana de una fecha YYYY-MM-DD (las semanas van de lunes a domingo). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((day + 6) % 7));
}

/**
 * Horas asignadas a cada persona en cada semana pedida. Las horas estimadas de una tarea sin
 * terminar se reparten por igual entre sus responsables y en línea recta entre su inicio y su fin.
 * Una tarea sin fechas, sin horas o sin responsables no suma.
 */
export function weeklyLoad(tasks: LoadTask[], weeks: string[]): Map<string, number[]> {
  const load = new Map<string, number[]>();
  for (const task of tasks) {
    if (task.status === 'DONE' || !task.startDate || !task.dueDate || !task.estimatedHours || task.assigneeIds.length === 0) continue;
    const days = Math.max(1, diffDays(task.startDate, task.dueDate) + 1);
    const perDay = task.estimatedHours / task.assigneeIds.length / days;
    const hoursByWeek = weeks.map((week) => {
      const from = task.startDate! > week ? task.startDate! : week;
      const weekEnd = addDays(week, 6);
      const to = task.dueDate! < weekEnd ? task.dueDate! : weekEnd;
      return to < from ? 0 : (diffDays(from, to) + 1) * perDay;
    });
    for (const userId of task.assigneeIds) {
      const current = load.get(userId) ?? weeks.map(() => 0);
      load.set(userId, current.map((hours, i) => hours + hoursByWeek[i]!));
    }
  }
  return load;
}
