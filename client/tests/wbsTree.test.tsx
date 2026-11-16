import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';
import { wbsTask } from './wbsFixtures';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };
const tree = [
  wbsTask({ id: 'p', title: 'Diseño', wbsCode: '1', childCount: 2, isSummary: true, progress: 45 }),
  wbsTask({ id: 'a', title: 'Maquetas', wbsCode: '1.1', parentId: 'p', progress: 100 }),
  wbsTask({ id: 'b', title: 'Guía', wbsCode: '1.2', parentId: 'p', position: 2, priority: 'HIGH' }),
  wbsTask({ id: 'q', title: 'Construcción', wbsCode: '2', position: 2 }),
];
const routes = (user: object, extra: object = {}) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/tasks': tree,
  'GET /api/projects/p1/milestones': [],
  ...extra,
});
const rows = async () => {
  const table = await screen.findByRole('table');
  return within(table).getAllByRole('row').slice(1);
};

describe('lista de tareas como EDT', () => {
  it('muestra el código y la sangría por nivel, en orden EDT', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    const list = await rows();
    expect(list.map((r) => r.querySelector('[data-wbs-code]')?.textContent)).toEqual(['1', '1.1', '1.2', '2']);
    expect(list.map((r) => r.getAttribute('data-depth'))).toEqual(['1', '2', '2', '1']);
  });

  it('una padre se pliega y su avance se ve como calculado', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    const user = userEvent.setup();
    const parentRow = (await rows())[0]!;
    expect(within(parentRow).getByText('45 %')).toHaveAttribute('data-summary');
    await user.click(screen.getByRole('button', { name: 'Plegar 1 Diseño' }));
    expect(screen.queryByRole('link', { name: 'Maquetas' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desplegar 1 Diseño' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Desplegar 1 Diseño' }));
    expect(screen.getByRole('link', { name: 'Maquetas' })).toBeInTheDocument();
  });

  it('el PM sube y baja tareas', async () => {
    const api = mockApi(routes(pmUser, { 'POST /api/tasks/a/move': tree }));
    renderApp('/proyectos/p1/tareas');
    await rows();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Bajar Maquetas' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/tasks/a/move')?.body).toEqual({ direction: 'down' }));
    expect(screen.getByRole('button', { name: 'Subir Guía' })).toBeInTheDocument();
  });

  it('el colaborador no ve los botones de orden', async () => {
    mockApi(routes(collaborator));
    renderApp('/proyectos/p1/tareas');
    await rows();
    expect(screen.queryByRole('button', { name: /^Subir / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bajar / })).not.toBeInTheDocument();
  });

  it('con un filtro muestra las antecesoras atenuadas para dar contexto', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    await rows();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Prioridad alta' }));
    const list = await rows();
    expect(list.map((r) => r.querySelector('[data-wbs-code]')?.textContent)).toEqual(['1', '1.2']);
    expect(list[0]).toHaveAttribute('data-context');
    expect(list[1]).not.toHaveAttribute('data-context');
  });
});
