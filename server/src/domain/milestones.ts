type Status = { status: string };

/**
 * Un hito pendiente está listo para marcarse como alcanzado cuando tiene trabajo ligado y todo está
 * terminado: tareas en «Hecha» y entregables en «Aceptado». Solo se sugiere; el PM lo marca.
 */
export function isReadyToReach(milestone: Status & { tasks: Status[]; deliverables: Status[] }): boolean {
  if (milestone.status !== 'PENDING') return false;
  if (milestone.tasks.length + milestone.deliverables.length === 0) return false;
  return milestone.tasks.every((t) => t.status === 'DONE') && milestone.deliverables.every((d) => d.status === 'ACCEPTED');
}
