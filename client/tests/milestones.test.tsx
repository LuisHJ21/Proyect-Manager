import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const milestone = (over: object) => ({ id: 'm1', name: 'Lanzamiento', dueDate: '2026-12-01', status: 'PENDING', readyToReach: false, ...over });

const render = (milestones: object[]) => {
  mockApi({
    ...signedInAs(pmUser),
    'GET /api/projects': [],
    'GET /api/me/tasks': [],
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
    'GET /api/projects/p1/objectives': [],
    'GET /api/projects/p1/milestones': milestones,
    'GET /api/projects/p1/members': [],
  });
  renderApp('/proyectos/p1/resumen');
};

describe('hitos', () => {
  it('sugiere marcar como alcanzado un hito listo', async () => {
    render([milestone({ readyToReach: true })]);
    expect(await screen.findByText('Listo para marcar como alcanzado')).toBeInTheDocument();
  });

  it('no sugiere nada si el hito no está listo', async () => {
    render([milestone({})]);
    expect(await screen.findByText('Lanzamiento')).toBeInTheDocument();
    expect(screen.queryByText('Listo para marcar como alcanzado')).not.toBeInTheDocument();
  });
});
