import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const activity = (id: string, title: string, warnings: string[] = []) => ({ id, title, description: '', warnings });
const matrix = {
  activities: [activity('a1', 'Diseño', ['missing_a', 'missing_r'])],
  members: [
    { id: 'u-ana', name: 'Ana' },
    { id: 'u-zoe', name: 'Zoe' },
  ],
  stakeholders: [{ id: 's-beto', name: 'Beto' }],
  cells: [] as object[],
};
const base = { ...signedInAs(pmUser), 'GET /api/projects/p1': project, 'GET /api/projects/p1/stakeholders': [] };
const open = () => renderApp('/proyectos/p1/interesados');
const matrixRegion = async () => screen.findByRole('region', { name: 'Matriz RACI' });

describe('matriz RACI', () => {
  it('muestra la matriz con columnas agrupadas y leyenda', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/raci': matrix });
    open();
    const region = await matrixRegion();
    const table = await within(region).findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Actividad', 'Equipo', 'Interesados', 'Ana', 'Zoe', 'Beto']);
    for (const text of ['R: hace el trabajo', 'A: rinde cuentas y aprueba', 'C: se le consulta', 'I: se le informa']) {
      expect(within(region).getByText(text)).toBeInTheDocument();
    }
  });

  it('muestra los avisos por fila', async () => {
    mockApi({
      ...base,
      'GET /api/projects/p1/raci': {
        ...matrix,
        activities: [activity('a1', 'Diseño', ['missing_a', 'missing_r']), activity('a2', 'Pruebas', ['multiple_a']), activity('a3', 'Cierre')],
      },
    });
    open();
    const region = await matrixRegion();
    const row = (title: string) => within(region).getByText(title).closest('tr') as HTMLElement;
    await within(region).findByText('Diseño');
    expect(within(row('Diseño')).getByText('Falta A')).toBeInTheDocument();
    expect(within(row('Diseño')).getByText('Falta R')).toBeInTheDocument();
    expect(within(row('Pruebas')).getByText('Más de una A')).toBeInTheDocument();
    expect(within(row('Cierre')).getByText('Completa')).toBeInTheDocument();
  });

  it('cambiar una celda envía PUT y desactiva la celda mientras tanto', async () => {
    let release: (value: unknown) => void = () => {};
    const api = mockApi({
      ...base,
      'GET /api/projects/p1/raci': matrix,
      'PUT /api/projects/p1/raci/cells': () => new Promise((resolve) => (release = resolve)),
    });
    open();
    const user = userEvent.setup();
    const select = await screen.findByRole('combobox', { name: 'Diseño — Ana' });
    await user.selectOptions(select, 'A');
    await waitFor(() => expect(select).toBeDisabled());
    expect(api.calls.find((c) => c.key === 'PUT /api/projects/p1/raci/cells')?.body).toEqual({ activityId: 'a1', kind: 'member', partyId: 'u-ana', role: 'A' });
    expect(select).toHaveValue('A');
    release({ ok: true });
    await waitFor(() => expect(select).toBeEnabled());
  });

  it('vaciar una celda envía role null', async () => {
    const api = mockApi({
      ...base,
      'GET /api/projects/p1/raci': { ...matrix, cells: [{ activityId: 'a1', kind: 'stakeholder', partyId: 's-beto', role: 'C' }] },
      'PUT /api/projects/p1/raci/cells': { ok: true },
    });
    open();
    const select = await screen.findByRole('combobox', { name: 'Diseño — Beto' });
    expect(select).toHaveValue('C');
    await userEvent.setup().selectOptions(select, '');
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'PUT /api/projects/p1/raci/cells')?.body).toEqual({ activityId: 'a1', kind: 'stakeholder', partyId: 's-beto', role: null }),
    );
  });

  it('si falla, la celda vuelve a su valor y muestra el motivo', async () => {
    const message = 'El participante no pertenece al proyecto';
    mockApi({
      ...base,
      'GET /api/projects/p1/raci': { ...matrix, cells: [{ activityId: 'a1', kind: 'member', partyId: 'u-ana', role: 'R' }] },
      'PUT /api/projects/p1/raci/cells': apiError(400, 'validation_error', { message, fields: { partyId: message } }),
    });
    open();
    const select = await screen.findByRole('combobox', { name: 'Diseño — Ana' });
    await userEvent.setup().selectOptions(select, 'A');
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue('R'));
  });

  it('estado vacío sin actividades', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/raci': { ...matrix, activities: [] } });
    open();
    const region = await matrixRegion();
    expect(await within(region).findByText(/Aún no hay actividades/)).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Añadir actividad' })).toBeInTheDocument();
  });

  it('estado vacío sin participantes', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/raci': { ...matrix, members: [], stakeholders: [] } });
    open();
    expect(await screen.findByText(/Añade miembros en el Resumen o interesados en el registro de arriba/)).toBeInTheDocument();
  });

  it('crear una actividad', async () => {
    const api = mockApi({
      ...base,
      'GET /api/projects/p1/raci': matrix,
      'POST /api/projects/p1/raci/activities': (body: { title: string }) =>
        body.title ? { id: 'a9', title: body.title, description: '' } : apiError(400, 'validation_error', { fields: { title: 'Escribe la actividad' } }),
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir actividad' }));
    const dialog = screen.getByRole('dialog', { name: 'Añadir actividad' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Escribe la actividad')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Actividad'), 'Aprobar diseño');
    await user.type(within(dialog).getByLabelText('Descripción'), 'Pantallas');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = api.calls.filter((c) => c.key === 'POST /api/projects/p1/raci/activities');
    expect(posts.at(-1)?.body).toEqual({ title: 'Aprobar diseño', description: 'Pantallas' });
  });

  it('editar y eliminar una actividad', async () => {
    const api = mockApi({
      ...base,
      'GET /api/projects/p1/raci': matrix,
      'PATCH /api/projects/p1/raci/activities/a1': { id: 'a1', title: 'Diseño final', description: '' },
      'DELETE /api/projects/p1/raci/activities/a1': { ok: true },
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Diseño' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar actividad' });
    const title = within(dialog).getByLabelText('Actividad');
    expect(title).toHaveValue('Diseño');
    await user.clear(title);
    await user.type(title, 'Diseño final');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1/raci/activities/a1')?.body).toEqual({ title: 'Diseño final', description: '' }));

    await user.click(screen.getByRole('button', { name: 'Eliminar Diseño' }));
    const confirm = screen.getByRole('dialog', { name: 'Eliminar actividad' });
    expect(within(confirm).getByText(/«Diseño»/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'DELETE /api/projects/p1/raci/activities/a1')).toBe(true));
  });

  it('la caja se desplaza y la primera columna es fija', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/raci': matrix });
    open();
    const region = await matrixRegion();
    const table = await within(region).findByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    expect(within(table).getByText('Diseño').closest('th, td')).toHaveClass('sticky');
  });
});

describe('quitar miembro', () => {
  it('avisa de sus celdas RACI', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
      'GET /api/projects/p1/objectives': [],
      'GET /api/projects/p1/milestones': [],
      'GET /api/projects/p1/members': [{ userId: 'u-ana', name: 'Ana', email: 'a@x.com', role: 'COLLABORATOR', projectRole: '' }],
      'GET /api/users': [],
      'GET /api/projects/p1/members/u-ana/impact': { tasks: 1, risks: 0, raciCells: 2 },
    });
    renderApp('/proyectos/p1/resumen');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Quitar a Ana' }));
    expect(await screen.findByText(/y de 2 celda\(s\) RACI/)).toBeInTheDocument();
  });
});
