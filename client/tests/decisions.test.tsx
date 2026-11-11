import { localToday } from '@pm/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 500000, currency: 'USD' };
const decision = (over: object = {}) => ({
  id: 'd2',
  number: 2,
  title: 'Usar proveedor B',
  rationale: 'Más barato',
  decidedBy: 'Comité',
  decidedOn: '2026-11-09',
  changeRequest: { id: 'cr1', number: 1, title: 'Agregar blog' },
  incident: { id: 'i3', number: 3, title: 'Caída' },
  createdAt: '2026-11-09T10:00:00.000Z',
  ...over,
});
const base = {
  ...signedInAs(pmUser),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/change-requests': [{ id: 'cr1', number: 1, title: 'Agregar blog', status: 'APPROVED', scheduleImpactDays: null, costImpactCents: null, createdAt: '2026-11-08T10:00:00.000Z' }],
  'GET /api/projects/p1/incidents': [{ id: 'i3', number: 3, title: 'Caída', status: 'OPEN' }],
};
const url = '/api/projects/p1/decisions';
const open = () => renderApp('/proyectos/p1/cambios');

describe('decisiones', () => {
  it('la pestaña se llama Control de cambios y muestra las dos tarjetas', async () => {
    mockApi({ ...base, [`GET ${url}`]: [] });
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Control de cambios' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Solicitudes de cambio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decisiones' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay decisiones.')).toBeInTheDocument();
  });

  it('lista con DEC-n y enlaces CR e INC', async () => {
    mockApi({ ...base, [`GET ${url}`]: [decision()] });
    open();
    const region = await screen.findByRole('region', { name: 'Decisiones' });
    const row = (await within(region).findByText('DEC-2')).closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Usar proveedor B');
    expect(row).toHaveTextContent('Comité');
    expect(row).toHaveTextContent('CR-1');
    expect(row).toHaveTextContent('INC-3');
  });

  it('crear una decisión envía la fecha de hoy por defecto y los enlaces', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [], [`POST ${url}`]: decision() });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir decisión' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir decisión' }));
    expect(dialog.getByLabelText('Fecha')).toHaveValue(localToday(new Date()));
    await user.type(dialog.getByLabelText('Título'), 'Usar proveedor B');
    await user.type(dialog.getByLabelText('Motivo'), 'Más barato');
    await user.type(dialog.getByLabelText('Quién decidió'), 'Comité');
    await user.selectOptions(dialog.getByLabelText('Cambio relacionado (opcional)'), 'cr1');
    await user.selectOptions(dialog.getByLabelText('Incidente relacionado (opcional)'), 'i3');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toEqual({
        title: 'Usar proveedor B',
        rationale: 'Más barato',
        decidedBy: 'Comité',
        decidedOn: localToday(new Date()),
        changeRequestId: 'cr1',
        incidentId: 'i3',
      }),
    );
  });

  it('editar y eliminar', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [decision()], [`PATCH ${url}/d2`]: decision({ title: 'Usar proveedor C' }), [`DELETE ${url}/d2`]: { ok: true } });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar DEC-2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar DEC-2' }));
    const title = dialog.getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Usar proveedor C');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/d2`)?.body).toMatchObject({ title: 'Usar proveedor C', decidedOn: '2026-11-09' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar DEC-2' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar decisión' })).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === `DELETE ${url}/d2`)).toBe(true));
  });
});

describe('quitar miembro', () => {
  it('el aviso cuenta los incidentes', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
      'GET /api/projects/p1/objectives': [],
      'GET /api/projects/p1/milestones': [],
      'GET /api/projects/p1/members': [{ userId: 'u-ana', name: 'Ana', email: 'a@x.com', role: 'COLLABORATOR', projectRole: '' }],
      'GET /api/users': [],
      'GET /api/projects/p1/members/u-ana/impact': { tasks: 0, risks: 0, raciCells: 0, incidents: 2 },
    });
    renderApp('/proyectos/p1/resumen');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Quitar a Ana' }));
    expect(await screen.findByText(/será responsable de 2 incidente\(s\) menos/)).toBeInTheDocument();
  });
});
