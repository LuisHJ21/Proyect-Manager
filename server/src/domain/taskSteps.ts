/** Avance de una tarea según sus pasos, o null si no tiene ninguno. */
export function stepProgress(steps: { done: boolean }[]): number | null {
  if (steps.length === 0) return null;
  return Math.round((steps.filter((step) => step.done).length / steps.length) * 100);
}
