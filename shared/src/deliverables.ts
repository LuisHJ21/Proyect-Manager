import type { DeliverableStatus } from './enums';

/** Se puede aceptar si hay al menos un criterio y todos se cumplen. */
export const canAccept = (criteria: readonly { met: boolean }[]) => criteria.length > 0 && criteria.every((c) => c.met);

/** Vencido: la fecha comprometida ya pasó y no está aceptado. */
export const isDeliverableOverdue = (d: { dueDate: string | null; status: string }, today: string) =>
  d.dueDate !== null && d.dueDate < today && d.status !== 'ACCEPTED';

const TRANSITIONS: Record<DeliverableStatus, readonly DeliverableStatus[]> = {
  PENDING: ['IN_REVIEW'],
  IN_REVIEW: ['PENDING'],
  REJECTED: ['PENDING', 'IN_REVIEW'],
  ACCEPTED: ['PENDING'],
};

/** Transiciones permitidas por edición directa. Aceptar o rechazar solo se hace con una revisión. */
export const canTransition = (from: DeliverableStatus, to: DeliverableStatus) => TRANSITIONS[from].includes(to);
