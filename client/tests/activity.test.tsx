import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD', closedAt: null };
const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).toISOString();
const entry = (over: object) => ({
  id: 'a1',
  action: 'updated',
  entity: 'task',
  entityId: 't1',
  entityLabel: 'Diseño del portal',
  changes: [],
  createdAt: at(14, 10, 42),
  user: { id: 'c1', name: 'Ana López' },
  ...over,
});
const url = '/api/projects/p1/activity';
const routes = (user: object = pmUser) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  [`GET ${url}/filters`]: { users: [{ id: 'c1', name: 'Ana López' }, { id: 'pm', name: 'Paula' }], entities: ['risk', 'task'] },
  [`GET ${url}`]: {
    items: [
      entry({ id: 'a1', changes: [{ field: 'status', from: 'IN_PROGRESS', to: 'DONE' }, { field: 'progress', from: 80, to: 100 }] }),
      entry({ id: 'a2', action: 'created', entity: 'risk', entityLabel: 'Proveedor tarde', createdAt: at(14, 9, 15), user: { id: 'pm', name: 'Paula' } }),
      entry({ id: 'a3', entity: 'deliverable', entityLabel: 'Portal', changes: [{ field: 'description' }], createdAt: at(13, 17, 3) }),
    ],
    nextCursor: 'a3',
  },
  [`GET ${url}?before=a3`]: {
    items: [entry({ id: 'a4', action: 'deleted', entity: 'expense', entityLabel: 'Licencias', createdAt: at(13, 16, 20) })],
    nextCursor: null,
  },
  [`GET ${url}?userId=c1`]: { items: [entry({ id: 'a1' })], nextCursor: null },
});

describe('pestaña Actividad', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('el PM ve la bitácora agrupada por día con los cambios traducidos', async () => {
    mockApi(routes());
    renderApp('/proyectos/p1/actividad');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Actividad' })).toBeInTheDocument();
    const first = await screen.findByRole('listitem', { name: /cambió la tarea «Diseño del portal»/ });
    expect(within(first).getByText('10:42')).toBeInTheDocument();
    expect(within(first).getByText('Ana López')).toBeInTheDocument();
    expect(within(first).getByText('Estado: En curso → Hecha · Avance: 80 % → 100 %')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '13 nov 2026' })).toBeInTheDocument();
    expect(screen.getByText('creó el riesgo «Proveedor tarde»')).toBeInTheDocument();
    expect(screen.getByText('(también cambió: descripción)')).toBeInTheDocument();
  });

  it('«Ver más» pide la página siguiente y desaparece al final', async () => {
    const api = mockApi(routes());
    renderApp('/proyectos/p1/actividad');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver más' }));
    expect(await screen.findByText('borró el gasto «Licencias»')).toBeInTheDocument();
    expect(api.calls.some((c) => c.key === `GET ${url}?before=a3`)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('el filtro por persona pide sus registros', async () => {
    const api = mockApi(routes());
    renderApp('/proyectos/p1/actividad');
    const user = userEvent.setup();
    await screen.findByText('creó el riesgo «Proveedor tarde»');
    await user.selectOptions(screen.getByLabelText('Persona'), 'c1');
    await waitFor(() => expect(api.calls.some((c) => c.key === `GET ${url}?userId=c1`)).toBe(true));
    await waitFor(() => expect(screen.queryByText('creó el riesgo «Proveedor tarde»')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Tipo')).toHaveDisplayValue('Todos');
  });

  it('el colaborador no ve la pestaña y la dirección lo lleva al resumen', async () => {
    const api = mockApi({ ...routes(collaborator), 'GET /api/projects/p1/indicators': {} });
    renderApp('/proyectos/p1/actividad');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).queryByRole('link', { name: 'Actividad' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((c) => c.key.startsWith(`GET ${url}`))).toBe(false));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'GET /api/projects/p1/indicators')).toBe(true));
  });
});
