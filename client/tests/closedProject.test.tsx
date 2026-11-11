import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const open = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD', closedAt: null };
const closed = { ...open, status: 'CLOSED', closedAt: '2026-11-10T15:00:00.000Z' };
const routes = (user: object, project: object = closed) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/users': [],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/tasks': [],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/objectives': [],
  'GET /api/projects/p1/risks': [],
  'GET /api/projects/p1/attachments': [],
  'GET /api/projects/p1/incidents': [],
  'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
});
const main = async () => within(await screen.findByRole('main'));

describe('proyecto cerrado', () => {
  it('aviso y controles ocultos', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    expect(await screen.findByText('Proyecto cerrado el 10 nov 2026 · solo lectura')).toBeInTheDocument();
    expect((await main()).queryByRole('button', { name: 'Nueva tarea' })).not.toBeInTheDocument();
  });

  it('los registros, los anexos y los incidentes no ofrecen añadir', async () => {
    for (const [path, name] of [
      ['riesgos', 'Añadir riesgo'],
      ['anexos', 'Adjuntar archivo'],
      ['incidentes', 'Reportar incidente'],
    ] as const) {
      mockApi(routes(pmUser));
      const { unmount } = renderApp(`/proyectos/p1/${path}`);
      await screen.findByText(/solo lectura/);
      await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('el resumen no ofrece editar el proyecto', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/resumen');
    await screen.findByText(/solo lectura/);
    expect(screen.queryByRole('button', { name: 'Editar proyecto' })).not.toBeInTheDocument();
  });

  it('reabrir', async () => {
    const api = mockApi({ ...routes(pmUser), 'POST /api/projects/p1/reopen': { status: 'open' } });
    renderApp('/proyectos/p1/tareas');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reabrir' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reabrir proyecto' }));
    const confirm = dialog.getByRole('button', { name: 'Reabrir' });
    expect(confirm).toBeDisabled();
    await user.type(dialog.getByLabelText('Motivo'), 'Falta una entrega');
    await user.click(confirm);
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/reopen')?.body).toEqual({ reason: 'Falta una entrega' }));
  });

  it('el colaborador no ve Reabrir', async () => {
    mockApi(routes(collaborator));
    renderApp('/proyectos/p1/tareas');
    expect(await screen.findByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
  });

  it('cancelado', async () => {
    mockApi(routes(pmUser, { ...closed, status: 'CANCELLED' }));
    renderApp('/proyectos/p1/tareas');
    expect(await screen.findByText('Proyecto cancelado el 10 nov 2026 · solo lectura')).toBeInTheDocument();
  });

  it('el formulario no ofrece Cerrado ni Cancelado', async () => {
    mockApi(routes(pmUser, open));
    renderApp('/proyectos/p1/resumen');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    const select = within(screen.getByRole('dialog', { name: 'Editar proyecto' })).getByLabelText('Estado');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Planificación', 'En ejecución', 'En pausa']);
  });
});
