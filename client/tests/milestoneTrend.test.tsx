import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = {
  id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD',
  healthOverdueTasks: 3, healthBudgetPercent: 90, healthIndexMin: 90, highRiskScore: 15,
};
const trend = [
  { id: 'm1', name: 'Lanzamiento', dueDate: '2026-11-30', status: 'PENDING', forecastDate: '2026-12-05', slipDays: 5, history: [{ date: '2026-11-10', forecastDate: '2026-11-30' }, { date: '2026-11-16', forecastDate: '2026-12-05' }] },
  { id: 'm2', name: 'Diseño', dueDate: '2026-11-05', status: 'REACHED', forecastDate: null, slipDays: null, history: [] },
];
const routes = {
  ...signedInAs(pmUser),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/indicators': { progress: 40, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
  'GET /api/projects/p1/milestone-trend': trend,
};

describe('tendencia de hitos y umbrales', () => {
  it('la tendencia muestra el desvío y el gráfico', async () => {
    mockApi(routes);
    renderApp('/proyectos/p1/resumen');
    const region = await screen.findByRole('region', { name: 'Tendencia de hitos' });
    expect(await within(region).findByText('+5 días')).toBeInTheDocument();
    expect(within(region).getByText('Alcanzado')).toBeInTheDocument();
    expect(within(region).getByRole('img', { name: 'Tendencia de hitos' })).toBeInTheDocument();
  });

  it('el formulario del proyecto envía los umbrales de salud', async () => {
    const api = mockApi({ ...routes, 'PATCH /api/projects/p1': project });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar proyecto' }));
    await user.clear(dialog.getByLabelText('Tareas vencidas para «En riesgo»'));
    await user.type(dialog.getByLabelText('Tareas vencidas para «En riesgo»'), '1');
    await user.clear(dialog.getByLabelText('Puntaje de riesgo alto'));
    await user.type(dialog.getByLabelText('Puntaje de riesgo alto'), '12');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1')?.body).toMatchObject({ healthOverdueTasks: 1, healthBudgetPercent: 90, healthIndexMin: 90, highRiskScore: 12 }),
    );
  });
});

describe('compartir lecciones', () => {
  it('la casilla viene marcada y se envía al desmarcarla', async () => {
    const api = mockApi({ ...routes, 'GET /api/projects/p1': { ...project, shareLessons: true }, 'PATCH /api/projects/p1': project });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar proyecto' }));
    const box = dialog.getByRole('checkbox', { name: 'Compartir lecciones en la biblioteca' });
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1')?.body).toMatchObject({ shareLessons: false }));
  });
});
