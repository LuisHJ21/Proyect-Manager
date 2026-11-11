export type IncidentViewer = { userId: string; isPm: boolean };
export type IncidentAccess = { view: boolean; edit: boolean; changeStatus: boolean; close: boolean };

/** Campos de un incidente que solo fija el Project Manager. */
export const PM_ONLY_INCIDENT_FIELDS = ['ownerId', 'priority', 'dueDate', 'riskId', 'title', 'description'] as const;

/** Qué puede hacer una persona con un incidente: la tabla de permisos de la especificación. */
export function incidentAccess(incident: { reportedById: string; ownerId: string | null; status: string }, viewer: IncidentViewer): IncidentAccess {
  if (viewer.isPm) return { view: true, edit: true, changeStatus: true, close: true };
  const isOwner = incident.ownerId === viewer.userId;
  return {
    view: isOwner || incident.reportedById === viewer.userId,
    edit: false,
    changeStatus: isOwner && incident.status !== 'CLOSED',
    close: false,
  };
}

export const isIncidentOverdue = (incident: { status: string; dueDate: string | null }, today: string) =>
  (incident.status === 'OPEN' || incident.status === 'IN_PROGRESS') && incident.dueDate !== null && incident.dueDate < today;

/** Recorta un título generado: nunca supera `max` y termina en "…" si se cortó. */
export function truncateTitle(text: string, max = 200): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
