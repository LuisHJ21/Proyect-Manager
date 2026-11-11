import { describe, expect, it } from 'vitest';
import { incidentAccess, isIncidentOverdue, truncateTitle } from '../../src/domain/incidents';

const incident = (status = 'OPEN') => ({ reportedById: 'beto', ownerId: 'ana', status });

describe('incidentAccess', () => {
  it('el PM puede todo, aunque esté cerrado', () => {
    for (const status of ['OPEN', 'CLOSED']) {
      expect(incidentAccess(incident(status), { userId: 'pm', isPm: true })).toEqual({ view: true, edit: true, changeStatus: true, close: true });
    }
  });
  it('el responsable avanza el estado salvo si está cerrado', () => {
    expect(incidentAccess(incident(), { userId: 'ana', isPm: false })).toEqual({ view: true, edit: false, changeStatus: true, close: false });
    expect(incidentAccess(incident('CLOSED'), { userId: 'ana', isPm: false })).toEqual({ view: true, edit: false, changeStatus: false, close: false });
  });
  it('quien reportó solo lo ve', () => {
    expect(incidentAccess(incident(), { userId: 'beto', isPm: false })).toEqual({ view: true, edit: false, changeStatus: false, close: false });
  });
  it('otro colaborador no puede nada', () => {
    expect(incidentAccess(incident(), { userId: 'cata', isPm: false })).toEqual({ view: false, edit: false, changeStatus: false, close: false });
  });
});

describe('isIncidentOverdue', () => {
  const today = '2026-11-10';
  it('vencido solo si abierto o en curso con fecha pasada', () => {
    expect(isIncidentOverdue({ status: 'OPEN', dueDate: '2026-11-09' }, today)).toBe(true);
    expect(isIncidentOverdue({ status: 'IN_PROGRESS', dueDate: '2026-11-09' }, today)).toBe(true);
    expect(isIncidentOverdue({ status: 'RESOLVED', dueDate: '2026-11-09' }, today)).toBe(false);
    expect(isIncidentOverdue({ status: 'OPEN', dueDate: today }, today)).toBe(false);
    expect(isIncidentOverdue({ status: 'OPEN', dueDate: null }, today)).toBe(false);
  });
});

describe('truncateTitle', () => {
  it('recorta a 200 con puntos suspensivos y deja intactos los cortos', () => {
    const long = truncateTitle('a'.repeat(250));
    expect(long).toHaveLength(200);
    expect(long.endsWith('…')).toBe(true);
    expect(truncateTitle('corto')).toBe('corto');
    expect(truncateTitle(`${'b'.repeat(198)}  xyz`)).toBe(`${'b'.repeat(198)}…`);
  });
});
