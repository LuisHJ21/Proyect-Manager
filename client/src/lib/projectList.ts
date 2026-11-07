import { ACTIVE_PROJECT_STATUS } from '@pm/shared';
import type { Project } from '../api/types';
import { normalizeText } from './display';

export type ProjectSortKey = 'health' | 'name' | 'progress' | 'endDate';
export type SortDirection = 'asc' | 'desc';
export type ProjectFilters = { search: string; status: string; health: string };

const HEALTH_RANK: Record<string, number> = { AT_RISK: 0, ATTENTION: 1, ON_TRACK: 2 };

/** Porcentaje gastado para dibujar la barra: siempre un número de 0 a 100. */
export function budgetPercent(spentCents: number, plannedCents: number): number {
  if (plannedCents <= 0) return 0;
  return Math.min(100, Math.round((spentCents / plannedCents) * 100));
}

export function filterProjects(projects: Project[], filters: ProjectFilters): Project[] {
  const search = normalizeText(filters.search.trim());
  return projects.filter((project) => {
    if (search && !normalizeText(project.name).includes(search)) return false;
    if (filters.status === 'ACTIVE' && !(ACTIVE_PROJECT_STATUS as readonly string[]).includes(project.status)) return false;
    if (filters.status !== 'ACTIVE' && filters.status !== 'ALL' && project.status !== filters.status) return false;
    if (filters.health !== 'ALL' && project.health !== filters.health) return false;
    return true;
  });
}

export function sortProjects(projects: Project[], key: ProjectSortKey, direction: SortDirection): Project[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: Project, b: Project): number => {
    switch (key) {
      case 'name':
        return sign * a.name.localeCompare(b.name, 'es');
      case 'progress':
        return sign * ((a.progress ?? 0) - (b.progress ?? 0));
      case 'health':
        // Los proyectos sin salud (cerrados y cancelados) siempre van al final.
        if (!a.health || !b.health) return a.health ? -1 : b.health ? 1 : 0;
        return sign * (HEALTH_RANK[a.health]! - HEALTH_RANK[b.health]!);
      case 'endDate':
        // Las fechas vacías siempre van al final.
        if (!a.endDate || !b.endDate) return a.endDate ? -1 : b.endDate ? 1 : 0;
        return sign * a.endDate.localeCompare(b.endDate);
    }
  };
  return [...projects].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name, 'es'));
}
