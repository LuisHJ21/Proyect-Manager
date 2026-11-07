export type ProjectRange = { startDate: string | null; endDate: string | null };

export function isWithinProject(date: string, project: ProjectRange): boolean {
  if (project.startDate && date < project.startDate) return false;
  if (project.endDate && date > project.endDate) return false;
  return true;
}

export function formatRange({ startDate, endDate }: ProjectRange): string {
  if (startDate && endDate) return `${startDate} a ${endDate}`;
  return startDate ? `desde ${startDate}` : `hasta ${endDate}`;
}

export const outsideProjectMessage = (project: ProjectRange) => `La fecha debe estar dentro del proyecto (${formatRange(project)})`;

/** Cuántas tareas tendrían alguna fecha fuera del intervalo. */
export function countTasksOutside(tasks: { startDate: string | null; dueDate: string | null }[], range: ProjectRange): number {
  return tasks.filter((task) => [task.startDate, task.dueDate].some((date) => date !== null && !isWithinProject(date, range))).length;
}
