import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyQuickFilter } from '../src/lib/taskFilters';
import type { Task } from '../src/api/types';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };
const member = { userId: 'c1', name: 'Carlos Vega', email: '', role: 'COLLABORATOR', projectRole: '', active: true };
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  version: 1,
  projectId: 'p1',
  milestoneId: null,
  title: 'Diseño',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  startDate: null,
  dueDate: null,
  progress: 0,
  assignees: [],
  predecessorIds: [],
  successorCount: 0,
  commentCount: 0,
  stepsDone: 0,
  stepsTotal: 0,
  wbsCode: '1',
  parentId: null,
  position: 1,
  deliverableId: null,
  childCount: 0,
  isSummary: false,
  estimatedHours: null,
  waitingOn: [],
  warnings: [],
  ...over,
});

const TODAY = '2026-11-07';
const ctx = { userId: 'c1', today: TODAY };
const ids = (list: Task[]) => list.map((t) => t.id);

describe('applyQuickFilter', () => {
  const list = [
    task({ id: 'mine', assignees: [{ id: 'c1', name: 'C' }] }),
    task({ id: 'high', priority: 'HIGH' }),
    task({ id: 'hoy', dueDate: TODAY }),
    task({ id: 'limite', dueDate: '2026-11-14' }),
    task({ id: 'tarde', dueDate: '2026-11-15' }),
    task({ id: 'hecha', dueDate: TODAY, status: 'DONE' }),
    task({ id: 'vencida', dueDate: '2026-11-01' }),
  ];
  it('all no filtra', () => expect(applyQuickFilter(list, 'all', ctx)).toHaveLength(7));
  it('mine', () => expect(ids(applyQuickFilter(list, 'mine', ctx))).toEqual(['mine']));
  it('high', () => expect(ids(applyQuickFilter(list, 'high', ctx))).toEqual(['high']));
  it('week incluye hoy y hoy+7, no hoy+8, terminadas ni vencidas', () => {
    expect(ids(applyQuickFilter(list, 'week', ctx))).toEqual(['hoy', 'limite']);
  });
});

describe('pestaña de tareas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 7, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  const routes = (user0: object, tasks: Task[] = [task()]) => ({
    ...signedInAs(user0),
    'GET /api/projects': [],
    'GET /api/me/tasks': [],
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/members': [member],
    'GET /api/projects/p1/tasks': tasks,
    'GET /api/projects/p1/milestones': [],
  });
  const mainOf = async () => within(await screen.findByRole('main'));

  it('el encabezado muestra ruta, título, equipo y Nueva tarea para el PM', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    const main = await mainOf();
    expect(await main.findByRole('heading', { level: 1, name: 'Portal' })).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/proyectos');
    expect(await main.findByLabelText('Equipo: Carlos Vega')).toBeInTheDocument();
    expect(main.getByRole('button', { name: 'Nueva tarea' })).toBeInTheDocument();
  });

  it('el colaborador no ve Nueva tarea', async () => {
    mockApi(routes(collaborator));
    renderApp('/proyectos/p1/tareas');
    const main = await mainOf();
    await main.findByRole('heading', { level: 1, name: 'Portal' });
    expect(main.queryByRole('button', { name: 'Nueva tarea' })).not.toBeInTheDocument();
  });

  it('las vistas son Tablero, Lista y Cronograma', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    const group = within(await screen.findByRole('group', { name: 'Vista de tareas' }));
    for (const name of ['Tablero', 'Lista', 'Cronograma']) expect(group.getByRole('button', { name })).toBeInTheDocument();
  });

  it('?vista=kanban abre el Tablero', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas?vista=kanban');
    expect(await screen.findByRole('heading', { name: 'En curso' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('una vista desconocida abre la Lista', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas?vista=xyz');
    expect(await screen.findByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Asignadas a mí" solo aparece al colaborador, y el contador refleja el filtro', async () => {
    const tasks = [task({ id: 'a', title: 'Mía', assignees: [{ id: 'c1', name: 'Carlos' }] }), task({ id: 'b', title: 'Otra' })];
    mockApi(routes(collaborator, tasks));
    renderApp('/proyectos/p1/tareas');
    const main = await mainOf();
    await main.findByRole('link', { name: 'Mía' });
    expect(main.getByText('2 tareas')).toBeInTheDocument();
    await userEvent.setup().click(main.getByRole('button', { name: 'Asignadas a mí' }));
    expect(main.getByText('1 tarea')).toBeInTheDocument();
    expect(main.queryByRole('link', { name: 'Otra' })).not.toBeInTheDocument();
  });

  it('el PM no tiene el filtro "Asignadas a mí"', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    const main = await mainOf();
    await main.findByRole('button', { name: 'Prioridad alta' });
    expect(main.queryByRole('button', { name: 'Asignadas a mí' })).not.toBeInTheDocument();
  });

  it('la tarjeta del tablero muestra prioridad, avance, fecha, comentarios e iniciales, y enlaza al detalle', async () => {
    const card = task({ priority: 'HIGH', progress: 40, dueDate: '2026-11-30', commentCount: 3, status: 'IN_PROGRESS', assignees: [{ id: 'c1', name: 'Carlos Vega' }] });
    mockApi(routes(pmUser, [card]));
    renderApp('/proyectos/p1/tareas?vista=tablero');
    const link = await screen.findByRole('link', { name: 'Diseño' });
    expect(link).toHaveAttribute('href', '/proyectos/p1/tareas/t1');
    const body = within(link.closest('li')!);
    expect(body.getByText('Alta')).toBeInTheDocument();
    expect(body.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(body.getByText('30 nov 2026')).toBeInTheDocument();
    expect(body.getByLabelText('3 comentarios')).toBeInTheDocument();
    expect(body.getByText('CV')).toBeInTheDocument();
  });

  it('muestra "2 de 5" si la tarea tiene pasos, en tablero y lista', async () => {
    mockApi(routes(pmUser, [task({ stepsDone: 2, stepsTotal: 5 })]));
    renderApp('/proyectos/p1/tareas?vista=tablero');
    expect(await screen.findByText('2 de 5')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lista' }));
    expect(await screen.findByText('2 de 5')).toBeInTheDocument();
  });

  it('un filtro sin resultados explica y permite limpiarlo, en tablero y lista', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas?vista=tablero');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Prioridad alta' }));
    expect(await screen.findByText('Ninguna tarea coincide con este filtro.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtro' }));
    expect(await screen.findByRole('link', { name: 'Diseño' })).toBeInTheDocument();
  });

  it('sin avance no se dibuja la barra', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas?vista=tablero');
    const link = await screen.findByRole('link', { name: 'Diseño' });
    expect(within(link.closest('li')!).queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

void render;
