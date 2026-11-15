import { localToday } from '@pm/shared';
import type { Notification } from '../api/types';
import { shortDate } from './display';

/** Frase del aviso: «Te asignaron la tarea «Diseño»». */
export function describeNotification(n: Notification): string {
  switch (n.kind) {
    case 'TASK_ASSIGNED':
      return `Te asignaron la tarea «${n.title}»`;
    case 'TASK_COMMENTED':
      return `${n.actorName} comentó en tu tarea «${n.title}»`;
    case 'TASK_DUE_SOON':
      return `La tarea «${n.title}» vence mañana`;
    case 'TASK_OVERDUE':
      return `La tarea «${n.title}» venció ayer`;
    case 'INCIDENT_ASSIGNED':
      return `Te asignaron el incidente «${n.title}»`;
    case 'CHANGE_PROPOSED':
      return `${n.actorName} propuso el cambio «${n.title}»`;
    case 'CHANGE_DECIDED':
      return `${n.detail === 'APPROVED' ? 'Aprobaron' : 'Rechazaron'} tu cambio «${n.title}»`;
  }
}

/** A dónde lleva el aviso. Incidentes y cambios no tienen página propia: van a su lista. */
export function notificationLink(n: Notification): string {
  if (n.kind === 'INCIDENT_ASSIGNED') return `/proyectos/${n.projectId}/incidentes`;
  if (n.kind === 'CHANGE_PROPOSED' || n.kind === 'CHANGE_DECIDED') return `/proyectos/${n.projectId}/cambios`;
  return `/proyectos/${n.projectId}/tareas/${n.entityId}`;
}

/** «ahora», «hace 5 min», «hace 3 h», «ayer» o la fecha corta. */
export function relativeTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const day = localToday(at);
  const today = localToday(now);
  if (day === today) return `hace ${Math.floor(minutes / 60)} h`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === localToday(yesterday)) return 'ayer';
  return shortDate(day);
}
