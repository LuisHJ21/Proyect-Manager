import { describe, expect, it } from 'vitest';
import type { Notification } from '../src/api/types';
import { describeNotification, notificationLink, relativeTime } from '../src/lib/notifications';

const notice = (extra: Partial<Notification>): Notification => ({
  id: 'n1',
  kind: 'TASK_ASSIGNED',
  projectId: 'p1',
  projectName: 'Portal web',
  entityId: 't1',
  title: 'Diseño',
  actorName: '',
  readAt: null,
  createdAt: '2026-11-14T10:00:00',
  ...extra,
});

describe('frases de avisos', () => {
  it.each([
    ['TASK_ASSIGNED', 'Te asignaron la tarea «Diseño»'],
    ['TASK_COMMENTED', 'Ana comentó en tu tarea «Diseño»'],
    ['TASK_DUE_SOON', 'La tarea «Diseño» vence mañana'],
    ['TASK_OVERDUE', 'La tarea «Diseño» venció ayer'],
  ] as const)('%s', (kind, text) => {
    expect(describeNotification(notice({ kind, actorName: 'Ana' }))).toBe(text);
  });

  it('INCIDENT_ASSIGNED', () => {
    expect(describeNotification(notice({ kind: 'INCIDENT_ASSIGNED', title: 'INC-3 Caída' }))).toBe('Te asignaron el incidente «INC-3 Caída»');
  });

  it('enlaces', () => {
    expect(notificationLink(notice({}))).toBe('/proyectos/p1/tareas/t1');
    expect(notificationLink(notice({ kind: 'TASK_OVERDUE' }))).toBe('/proyectos/p1/tareas/t1');
    expect(notificationLink(notice({ kind: 'INCIDENT_ASSIGNED', entityId: 'i1' }))).toBe('/proyectos/p1/incidentes');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-14T15:00:00');
  it.each([
    ['2026-11-14T14:59:30', 'ahora'],
    ['2026-11-14T14:55:00', 'hace 5 min'],
    ['2026-11-14T12:00:00', 'hace 3 h'],
    ['2026-11-13T22:00:00', 'ayer'],
    ['2026-11-10T09:00:00', '10 nov 2026'],
  ])('%s → %s', (iso, text) => {
    expect(relativeTime(iso, now)).toBe(text);
  });
});
