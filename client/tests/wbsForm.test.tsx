import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { apiError, mockApi, pmUser, renderApp, signedInAs } from './helpers';
import { wbsTask } from './wbsFixtures';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const P = wbsTask({ id: 'p', title: 'Diseño', wbsCode: '1', childCount: 2, isSummary: true, plannedCostCents: 400, startDate: '2026-03-01', dueDate: '2026-03-20' });
const A = wbsTask({ id: 'a', title: 'Maquetas', wbsCode: '1.1', parentId: 'p' });
const B = wbsTask({ id: 'b', title: 'Guía', wbsCode: '1.2', parentId: 'p', position: 2 });
const Q = wbsTask({ id: 'q', title: 'Construcción', wbsCode: '2', position: 2 });
const detail = (task: typeof A, over: Partial<TaskDetail> = {}): TaskDetail => ({ ...task, steps: [], comments: [], ancestors: [], children: [], ...over });
const deliverables = [{ id: 'd1', number: 1, name: 'Portal publicado', status: 'PENDING', dueDate: null, overdue: false, milestone: null, criteriaMet: 0, criteriaTotal: 0, lastReview: null, version: 1 }];
const routes = (open: TaskDetail, extra: object = {}) => ({
  ...signedInAs(pmUser),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  [`GET /api/tasks/${open.id}`]: open,
  [`GET /api/tasks/${open.id}/attachments`]: [],
  'GET /api/projects/p1/tasks': [P, A, B, Q],
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: true }],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/deliverables': deliverables,
  ...extra,
});
const openForm = async (id: string) => {
  renderApp(`/proyectos/p1/tareas/${id}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
  return { user, dialog: within(await screen.findByRole('dialog')) };
};
const optionNames = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

describe('formulario de tarea con EDT', () => {
  it('la tarea padre excluye la propia tarea y sus descendientes', async () => {
    mockApi(routes(detail(P, { children: [{ id: 'a', title: 'Maquetas', wbsCode: '1.1' }, { id: 'b', title: 'Guía', wbsCode: '1.2' }] })));
    const { dialog } = await openForm('p');
    await waitFor(() => expect(optionNames(dialog.getByLabelText('Tarea padre'))).toEqual(['Ninguna (raíz)', '2 Construcción']));
  });

  it('una hoja puede ir bajo una hermana y se elige entregable', async () => {
    const api = mockApi(routes(detail(A, { ancestors: [{ id: 'p', title: 'Diseño', wbsCode: '1' }] }), { 'PATCH /api/tasks/a': A }));
    const { user, dialog } = await openForm('a');
    await waitFor(() => expect(optionNames(dialog.getByLabelText('Tarea padre'))).toEqual(['Ninguna (raíz)', '1 Diseño', '1.2 Guía', '2 Construcción']));
    expect(dialog.getByLabelText('Tarea padre')).toHaveValue('p');
    await waitFor(() => expect(optionNames(dialog.getByLabelText('Entregable'))).toEqual(['Sin entregable', 'ENT-1 · Portal publicado']));
    await user.selectOptions(dialog.getByLabelText('Tarea padre'), 'q');
    await user.selectOptions(dialog.getByLabelText('Entregable'), 'd1');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/a')?.body).toMatchObject({ parentId: 'q', deliverableId: 'd1' }));
  });

  it('sin cambios no envía padre ni entregable', async () => {
    const api = mockApi(routes(detail(A), { 'PATCH /api/tasks/a': A }));
    const { user, dialog } = await openForm('a');
    await waitFor(() => expect(dialog.getByLabelText('Tarea padre')).toHaveValue('p'));
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/a')).toBeTruthy());
    const body = api.calls.find((c) => c.key === 'PATCH /api/tasks/a')!.body as object;
    expect(body).not.toHaveProperty('parentId');
    expect(body).not.toHaveProperty('deliverableId');
  });

  it('en una padre fechas, costo y responsables son de solo lectura y no se envían', async () => {
    const api = mockApi(routes(detail(P), { 'PATCH /api/tasks/p': P }));
    const { user, dialog } = await openForm('p');
    expect(dialog.getByLabelText('Fecha de inicio')).toBeDisabled();
    expect(dialog.getByLabelText('Fecha límite')).toBeDisabled();
    expect(dialog.getByLabelText('Costo planeado')).toBeDisabled();
    expect(dialog.getAllByText('Se calcula con sus subtareas').length).toBeGreaterThan(0);
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/p')).toBeTruthy());
    const body = api.calls.find((c) => c.key === 'PATCH /api/tasks/p')!.body as object;
    for (const key of ['startDate', 'dueDate', 'plannedCostCents', 'assigneeIds']) expect(body).not.toHaveProperty(key);
  });

  it('el 409 por trabajo propio se muestra sin cerrar el formulario', async () => {
    const message = 'Esta tarea tiene trabajo propio. Antes de añadirle subtareas, quita o mueve: responsables';
    mockApi(routes(detail(A), { 'PATCH /api/tasks/a': apiError(409, 'task_has_work', { message }) }));
    const { user, dialog } = await openForm('a');
    await waitFor(() => expect(dialog.getByLabelText('Tarea padre')).toHaveValue('p'));
    await user.selectOptions(dialog.getByLabelText('Tarea padre'), 'q');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    expect(await dialog.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('detalle de tarea con EDT', () => {
  it('muestra el código, las migas y, en una padre, sus subtareas', async () => {
    mockApi(routes(detail(A, { ancestors: [{ id: 'p', title: 'Diseño', wbsCode: '1' }] })));
    renderApp('/proyectos/p1/tareas/a');
    expect(await screen.findByRole('heading', { name: '1.1 Maquetas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1 Diseño' })).toHaveAttribute('href', '/proyectos/p1/tareas/p');
  });

  it('una padre lista sus subtareas y no ofrece pasos ni dependencias', async () => {
    mockApi(routes(detail(P, { children: [{ id: 'a', title: 'Maquetas', wbsCode: '1.1' }, { id: 'b', title: 'Guía', wbsCode: '1.2' }] })));
    renderApp('/proyectos/p1/tareas/p');
    const section = await screen.findByRole('region', { name: 'Subtareas' });
    expect(within(section).getByRole('link', { name: '1.1 Maquetas' })).toHaveAttribute('href', '/proyectos/p1/tareas/a');
    expect(screen.queryByLabelText('Añadir predecesora')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir paso' })).not.toBeInTheDocument();
  });

  it('las predecesoras posibles no incluyen padres', async () => {
    mockApi(routes(detail(Q)));
    renderApp('/proyectos/p1/tareas/q');
    await screen.findByRole('option', { name: 'Maquetas' });
    expect(optionNames(screen.getByLabelText('Añadir predecesora'))).not.toContain('Diseño');
  });
});

describe('gastos con EDT', () => {
  it('el selector de tarea del gasto no ofrece padres', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/tasks': [P, A, B, Q],
      'GET /api/projects/p1/expenses': [],
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [], budget: { plannedCents: 0, spentCents: 0, differenceCents: 0 }, highRisks: 0 },
    });
    renderApp('/proyectos/p1/presupuesto');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    const select = within(screen.getByRole('dialog')).getByLabelText('Tarea (opcional)');
    await waitFor(() => expect(optionNames(select)).toContain('Maquetas'));
    expect(optionNames(select)).not.toContain('Diseño');
  });
});

describe('hallazgos de la revisión final en la interfaz', () => {
  it('una padre no ofrece el formulario de estado y avance', async () => {
    mockApi(routes(detail(P, { children: [{ id: 'a', title: 'Maquetas', wbsCode: '1.1' }] })));
    renderApp('/proyectos/p1/tareas/p');
    await screen.findByRole('region', { name: 'Subtareas' });
    expect(screen.queryByRole('button', { name: 'Guardar avance' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Propiedades de la tarea' })).queryByLabelText('Estado')).not.toBeInTheDocument();
  });

  it('la invitación a fijar la línea base no cuenta padres', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/tasks': [{ ...P, plannedCostCents: 400 }, { ...A, plannedCostCents: 100 }, { ...B, plannedCostCents: 300 }],
      'GET /api/projects/p1/performance': { baseline: null, history: [], metrics: null, tasks: [], outsideBaseline: 0, outsideBaselineCostCents: 0, series: [] },
      'GET /api/projects/p1/change-requests': [],
    });
    renderApp('/proyectos/p1/desempeno');
    expect(await screen.findByText('2 tareas con costo planeado.')).toBeInTheDocument();
  });
});

