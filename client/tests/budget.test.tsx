import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'PLANNING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 100000, currency: 'USD' };
const routes = {
  ...signedInAs(pmUser),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/expenses': [],
  'GET /api/projects/p1/indicators': {
    progress: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    upcomingMilestones: [],
    budget: { plannedCents: 100000, spentCents: 150000, differenceCents: -50000 },
    highRisks: 0,
  },
};

describe('presupuesto', () => {
  it('muestra planificado, gastado y diferencia, y marca el sobrecosto', async () => {
    mockApi(routes);
    renderApp('/proyectos/p1/presupuesto');
    expect(await screen.findByText('Planificado')).toBeInTheDocument();
    expect(screen.getByText('Gastado')).toBeInTheDocument();
    expect(screen.getByText('Diferencia')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/superan el presupuesto/i);
  });

  it('un monto inválido no se envía y marca el campo', async () => {
    const api = mockApi({ ...routes, 'POST /api/projects/p1/expenses': { id: 'e1' } });
    renderApp('/proyectos/p1/presupuesto');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Descripción'), 'Licencia');
    await user.type(dialog.getByLabelText('Monto'), '-5');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await dialog.findByText(/Monto inválido/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('un monto vacío tampoco se envía', async () => {
    const api = mockApi({ ...routes, 'POST /api/projects/p1/expenses': { id: 'e1' } });
    renderApp('/proyectos/p1/presupuesto');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Monto inválido/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('un monto en formato latino se guarda en centavos', async () => {
    const api = mockApi({ ...routes, 'POST /api/projects/p1/expenses': { id: 'e1' } });
    renderApp('/proyectos/p1/presupuesto');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Descripción'), 'Licencia');
    await user.type(dialog.getByLabelText('Monto'), '1.234,50');
    await user.type(dialog.getByLabelText('Fecha'), '2026-11-01');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'POST /api/projects/p1/expenses');
      expect(call?.body).toMatchObject({ amountCents: 123450, date: '2026-11-01', category: 'LABOR' });
    });
  });
});
