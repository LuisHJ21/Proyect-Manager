import { describe, expect, it } from 'vitest';
import type { Project } from '../src/api/types';
import { budgetPercent, filterProjects, sortProjects } from '../src/lib/projectList';

const project = (over: Partial<Project>): Project => ({
  id: 'x',
  name: 'X',
  description: '',
  status: 'EXECUTING',
  approach: 'AGILE',
  startDate: null,
  endDate: null,
  progress: 0,
  team: [],
  ...over,
});

const names = (list: Project[]) => list.map((p) => p.name);

describe('budgetPercent', () => {
  it('con presupuesto 0 da 0 y limita a 100', () => {
    expect(budgetPercent(500, 0)).toBe(0);
    expect(budgetPercent(50, 100)).toBe(50);
    expect(budgetPercent(150, 100)).toBe(100);
  });
});

describe('filterProjects', () => {
  const list = [
    project({ name: 'Migración ERP', health: 'ATTENTION' }),
    project({ name: 'Portal', health: 'ON_TRACK', status: 'PAUSED' }),
    project({ name: 'Viejo', status: 'CLOSED', health: null }),
  ];
  it('busca sin acentos ni mayúsculas', () => {
    expect(names(filterProjects(list, { search: 'MIGRACION', status: 'ALL', health: 'ALL' }))).toEqual(['Migración ERP']);
  });
  it('ACTIVE excluye cerrados y cancelados; ALL no', () => {
    expect(names(filterProjects(list, { search: '', status: 'ACTIVE', health: 'ALL' }))).toEqual(['Migración ERP', 'Portal']);
    expect(filterProjects(list, { search: '', status: 'ALL', health: 'ALL' })).toHaveLength(3);
  });
  it('filtra por un estado y por salud', () => {
    expect(names(filterProjects(list, { search: '', status: 'PAUSED', health: 'ALL' }))).toEqual(['Portal']);
    expect(names(filterProjects(list, { search: '', status: 'ALL', health: 'ATTENTION' }))).toEqual(['Migración ERP']);
  });
});

describe('sortProjects', () => {
  const list = [
    project({ id: '1', name: 'B', progress: 50, endDate: null, health: 'ON_TRACK' }),
    project({ id: '2', name: 'A', progress: 10, endDate: '2026-12-01', health: 'AT_RISK' }),
    project({ id: '3', name: 'C', progress: 90, endDate: '2026-11-01', health: 'ATTENTION' }),
    project({ id: '4', name: 'D', progress: 0, endDate: '2026-10-01', health: null }),
  ];
  it('por salud: riesgo, atención, al día y sin salud al final', () => {
    expect(names(sortProjects(list, 'health', 'asc'))).toEqual(['A', 'C', 'B', 'D']);
  });
  it('por proyecto y por avance', () => {
    expect(names(sortProjects(list, 'name', 'asc'))).toEqual(['A', 'B', 'C', 'D']);
    expect(names(sortProjects(list, 'progress', 'desc'))).toEqual(['C', 'B', 'A', 'D']);
  });
  it('por fin, con fechas vacías al final en ambas direcciones', () => {
    expect(names(sortProjects(list, 'endDate', 'asc'))).toEqual(['D', 'C', 'A', 'B']);
    expect(names(sortProjects(list, 'endDate', 'desc'))).toEqual(['A', 'C', 'D', 'B']);
  });
});
