/**
 * Pronóstico de un hito pendiente: la fecha de fin más tardía de sus hojas sin terminar; una hoja
 * vencida no puede terminar antes de hoy. Sin hojas pendientes con fecha, su fecha prevista. Un hito
 * alcanzado no tiene pronóstico.
 */
export function forecastDate(milestone: { dueDate: string; status: string }, leaves: { status: string; dueDate: string | null }[], today: string): string | null {
  if (milestone.status === 'REACHED') return null;
  const ends = leaves.filter((l) => l.status !== 'DONE' && l.dueDate !== null).map((l) => (l.dueDate! < today ? today : l.dueDate!));
  if (ends.length === 0) return milestone.dueDate;
  return ends.sort().at(-1)!;
}
