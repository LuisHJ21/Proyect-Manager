import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { apiError, mockApi, pmUser, renderApp, signedInAs } from './helpers';
import { wbsTask } from './wbsFixtures';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: '2026-01-01', endDate: '2026-01-31', plannedBudgetCents: 0, currency: 'USD' };
const A = wbsTask({ id: 'a', title: 'Diseño', wbsCode: '1', startDate: '2026-01-01', dueDate: '2026-01-08', successorCount: 1 });
const B = wbsTask({ id: 'b', title: 'Construcción', wbsCode: '2', position: 2, startDate: '2026-01-06', dueDate: '2026-01-07', predecessorIds: ['a'], predecessors: [{ id: 'a', type: 'SS', lagDays: 2 }] });
const C = wbsTask({ id: 'c', title: 'Pruebas', wbsCode: '3', position: 3, startDate: '2026-01-20', dueDate: '2026-01-22' });
const schedule = {
  tasks: [
    { id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-08', lateStart: '2026-01-01', lateFinish: '2026-01-08', totalFloat: 0, critical: true },
    { id: 'b', earlyStart: '2026-01-09', earlyFinish: '2026-01-10', lateStart: '2026-01-09', lateFinish: '2026-01-10', totalFloat: 0, critical: true },
    { id: 'c', earlyStart: '2026-01-20', earlyFinish: '2026-01-22', lateStart: '2026-01-23', lateFinish: '2026-01-25', totalFloat: 3, critical: false },
  ],
  critical: ['a', 'b'],
  unscheduled: [],
};
const detail = (task: typeof A, over: Partial<TaskDetail> = {}): TaskDetail => ({ ...task, steps: [], comments: [], ancestors: [], children: [], ...over });
const routes = (open: TaskDetail, extra: object = {}) => ({
  ...signedInAs(pmUser),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  [`GET /api/tasks/${open.id}`]: open,
  [`GET /api/tasks/${open.id}/attachments`]: [],
  [`GET /api/tasks/${open.id}/time-entries`]: [],
  'GET /api/projects/p1/tasks': [A, B, C],
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/expenses': [],
  'GET /api/projects/p1/deliverables': [],
  'GET /api/projects/p1/schedule': schedule,
  [`GET /api/tasks/${open.id}/reschedule`]: { changes: [], applied: false },
  ...extra,
});

describe('dependencias con tipo y desfase', () => {
  it('la lista muestra el tipo y el desfase, y se edita', async () => {
    const api = mockApi(routes(detail(B), { 'PATCH /api/tasks/b/dependencies/a': detail(B) }));
    renderApp('/proyectos/p1/tareas/b');
    expect(await screen.findByText('SS +2 d')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar dependencia con Diseño' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'FF');
    await user.clear(dialog.getByLabelText('Desfase (días)'));
    await user.type(dialog.getByLabelText('Desfase (días)'), '-1');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/b/dependencies/a')?.body).toEqual({ type: 'FF', lagDays: -1 }));
  });

  it('añadir una predecesora con tipo y desfase', async () => {
    const api = mockApi(routes(detail(C), { 'POST /api/tasks/c/dependencies': detail(C) }));
    renderApp('/proyectos/p1/tareas/c');
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Diseño' });
    await user.selectOptions(screen.getByLabelText('Añadir predecesora'), 'a');
    await user.selectOptions(screen.getByLabelText('Tipo de dependencia'), 'SS');
    await user.clear(screen.getByLabelText('Desfase'));
    await user.type(screen.getByLabelText('Desfase'), '2');
    await user.click(screen.getByRole('button', { name: 'Añadir dependencia' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/tasks/c/dependencies')?.body).toEqual({ predecessorId: 'a', type: 'SS', lagDays: 2 }));
  });
});

describe('ruta crítica', () => {
  it('el cronograma resalta las críticas, con leyenda y holgura', async () => {
    mockApi(routes(detail(A)));
    renderApp('/proyectos/p1/tareas?vista=cronograma');
    await screen.findByRole('button', { name: 'Construcción' });
    await waitFor(() => expect(document.querySelectorAll('rect[data-critical]')).toHaveLength(2));
    expect(screen.getByText('Ruta crítica')).toBeInTheDocument();
    const titles = [...document.querySelectorAll('rect title')].map((t) => t.textContent);
    expect(titles.some((t) => t?.includes('Pruebas') && t.includes('Holgura: 3 d'))).toBe(true);
  });

  it('el detalle muestra la holgura y si es crítica', async () => {
    mockApi(routes(detail(A)));
    renderApp('/proyectos/p1/tareas/a');
    expect(await screen.findByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Holgura: 0 d')).toBeInTheDocument();
  });

  it('el aviso de fechas en conflicto usa el texto nuevo', async () => {
    mockApi(routes(detail(B, { warnings: ['date_conflict'] })));
    renderApp('/proyectos/p1/tareas/b');
    expect(await screen.findByText('Las fechas no respetan una dependencia')).toBeInTheDocument();
  });
});

describe('reprogramar sucesoras', () => {
  const changes = [{ id: 'b', from: { startDate: '2026-01-06', dueDate: '2026-01-07' }, to: { startDate: '2026-01-09', dueDate: '2026-01-10' } }];

  it('avisa, muestra la propuesta y aplica', async () => {
    const api = mockApi(routes(detail(A), { 'GET /api/tasks/a/reschedule': { changes, applied: false }, 'POST /api/tasks/a/reschedule': { changes, applied: true } }));
    renderApp('/proyectos/p1/tareas/a');
    expect(await screen.findByText('Hay sucesoras que ya no respetan sus dependencias')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reprogramar sucesoras' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reprogramar sucesoras' }));
    const row = dialog.getByText('Construcción').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('6 ene');
    expect(row).toHaveTextContent('9 ene');
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/tasks/a/reschedule')?.body).toEqual({ apply: true }));
    expect(api.calls.filter((c) => c.key === 'POST /api/tasks/a/reschedule')).toHaveLength(1);
  });

  it('un 409 por fechas fuera del proyecto se muestra en la ventana', async () => {
    const message = 'La reprogramación deja tareas fuera del proyecto: Construcción';
    mockApi(routes(detail(A), { 'GET /api/tasks/a/reschedule': { changes, applied: false }, 'POST /api/tasks/a/reschedule': apiError(409, 'reschedule_outside', { message }) }));
    renderApp('/proyectos/p1/tareas/a');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reprogramar sucesoras' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reprogramar sucesoras' }));
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    expect(await dialog.findByText(message)).toBeInTheDocument();
  });
});

describe('datos que se refrescan', () => {
  it('guardar una tarea vuelve a pedir la ruta crítica', async () => {
    const api = mockApi(routes(detail(A), { 'PATCH /api/tasks/a': A }));
    renderApp('/proyectos/p1/tareas/a');
    const user = userEvent.setup();
    await screen.findByText('Holgura: 0 d');
    const before = api.calls.filter((c) => c.key === 'GET /api/projects/p1/schedule').length;
    await user.click(screen.getByRole('button', { name: 'Editar tarea' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key === 'GET /api/projects/p1/schedule').length).toBeGreaterThan(before));
  });
});

