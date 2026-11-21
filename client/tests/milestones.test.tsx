import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'PLANNING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const milestone = (over: object) => ({ id: 'm1', name: 'Lanzamiento', dueDate: '2026-12-01', status: 'PENDING', readyToReach: false, ...over });

const render = (milestones: object[]) => {
  const api = mockApi({
    ...signedInAs(pmUser),
    'GET /api/projects': [],
    'GET /api/me/tasks': [],
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
    'GET /api/projects/p1/objectives': [],
    'GET /api/projects/p1/milestones': milestones,
    'GET /api/projects/p1/members': [],
    'POST /api/projects/p1/milestones': milestone({ name: 'Acta y objetivos aprobados' }),
  });
  renderApp('/proyectos/p1/resumen');
  return api;
};

describe('hitos', () => {
  it('tiene una sección propia y propone un hito editable con fecha elegida por el PM', async () => {
    const api = render([]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Hitos' }));
    expect(await screen.findByRole('button', { name: 'Añadir hito' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar Acta y objetivos aprobados' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir hito' }));
    expect(dialog.getByLabelText('Nombre')).toHaveValue('Acta y objetivos aprobados');
    expect(dialog.getByLabelText('Fecha límite')).toHaveValue('');
    await user.type(dialog.getByLabelText('Fecha límite'), '2026-12-01');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((call) => call.key === 'POST /api/projects/p1/milestones')?.body).toEqual({ name: 'Acta y objetivos aprobados', dueDate: '2026-12-01', status: 'PENDING' }));
  });
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
