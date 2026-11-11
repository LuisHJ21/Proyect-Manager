import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD', closedAt: null };
const lesson = (over: object = {}) => ({
  id: 'l1',
  type: 'TO_IMPROVE',
  category: 'COST',
  situation: 'Se subestimó el costo',
  recommendation: 'Reservar 10 %',
  author: { id: 'c1', name: 'Carlos' },
  project: { id: 'p1', name: 'Portal' },
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  canEdit: true,
  ...over,
});
const url = '/api/projects/p1/lessons';
const routes = (list: object[], proj: object = project, user: object = collaborator) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': proj,
  'GET /api/projects/p1/members': [],
  [`GET ${url}`]: list,
});
const open = () => renderApp('/proyectos/p1/lecciones');

describe('lecciones del proyecto', () => {
  it('crear', async () => {
    const api = mockApi({ ...routes([]), [`POST ${url}`]: lesson() });
    open();
    expect(await screen.findByText('Aún no hay lecciones aprendidas.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Añadir lección' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir lección' }));
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'TO_IMPROVE');
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'COST');
    await user.type(dialog.getByLabelText('Situación'), 'Se subestimó');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toEqual({ type: 'TO_IMPROVE', category: 'COST', situation: 'Se subestimó', recommendation: '' }),
    );
  });

  it('editar solo con canEdit', async () => {
    mockApi(routes([lesson({ id: 'l1', canEdit: false }), lesson({ id: 'l2', situation: 'Propia', canEdit: true })]));
    open();
    const cards = await screen.findAllByRole('article');
    expect(within(cards[0]!).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(cards[1]!).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(cards[0]!).getByText('A mejorar')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Costos')).toBeInTheDocument();
  });

  it('filtros', async () => {
    mockApi(routes([lesson(), lesson({ id: 'l2', category: 'TEAM', type: 'WORKED_WELL', situation: 'Buen equipo' })]));
    open();
    await screen.findByText('Buen equipo');
    await userEvent.setup().selectOptions(screen.getByLabelText('Categoría'), 'COST');
    expect(screen.queryByText('Buen equipo')).not.toBeInTheDocument();
    expect(screen.getByText('Se subestimó el costo')).toBeInTheDocument();
  });

  it('se puede añadir con el proyecto cerrado', async () => {
    mockApi(routes([], { ...project, status: 'CLOSED', closedAt: '2026-11-10T10:00:00.000Z' }));
    open();
    await screen.findByText(/solo lectura/);
    expect(await screen.findByRole('button', { name: 'Añadir lección' })).toBeInTheDocument();
  });

  it('la pestaña está para todos', async () => {
    mockApi(routes([]));
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Lecciones' })).toBeInTheDocument();
  });
});

describe('página global de lecciones', () => {
  it('búsqueda y enlace al proyecto', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/lessons': [lesson()],
      'GET /api/lessons?q=subestim': [lesson()],
    });
    renderApp('/lecciones');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Lecciones' })).toHaveAttribute('href', '/lecciones');
    const card = await screen.findByRole('article');
    expect(within(card).getByRole('link', { name: 'Portal' })).toHaveAttribute('href', '/proyectos/p1/lecciones');
    expect(within(card).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText('Buscar'), 'subestim');
    await waitFor(() => expect(api.calls.some((c) => c.key === 'GET /api/lessons?q=subestim')).toBe(true));
  });

  it('sin resultados', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/lessons': [] });
    renderApp('/lecciones');
    expect(await screen.findByText('No hay lecciones que coincidan.')).toBeInTheDocument();
  });
});
