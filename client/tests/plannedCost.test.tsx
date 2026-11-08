import { formatMoney } from '@pm/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const task = (over: Partial<TaskDetail> = {}): TaskDetail => ({
  id: 't1',
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
  waitingOn: [],
  warnings: [],
  comments: [],
  steps: [],
  ...over,
});
const expense = (id: string, amountCents: number, taskId: string | null) => ({ id, description: `Gasto ${id}`, amountCents, date: '2026-11-01', category: 'OTHER', taskId });
const base = (user: object, detail: TaskDetail) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/tasks/t1': detail,
  'GET /api/tasks/t1/attachments': [],
  'GET /api/projects/p1/tasks': [detail],
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/milestones': [],
});

describe('costo planeado', () => {
  it('el PM escribe el costo planeado con formato local', async () => {
    const api = mockApi({ ...base(pmUser, task()), 'POST /api/projects/p1/tasks': task({ id: 't9' }) });
    renderApp('/proyectos/p1/tareas');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nueva tarea' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Título'), 'Blog');
    await user.type(dialog.getByLabelText('Costo planeado'), '1.234,50');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/tasks')?.body).toMatchObject({ plannedCostCents: 123450 }));
  });

  it('el formulario de edición muestra el costo guardado', async () => {
    mockApi({ ...base(pmUser, task({ plannedCostCents: 500000 })), 'GET /api/projects/p1/expenses': [] });
    renderApp('/proyectos/p1/tareas/t1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Costo planeado')).toHaveValue('5000,00');
  });

  it('el detalle muestra costo planeado y gasto ligado al PM', async () => {
    mockApi({
      ...base(pmUser, task({ plannedCostCents: 500000 })),
      'GET /api/projects/p1/expenses': [expense('e1', 1000, 't1'), expense('e2', 2500, 't1'), expense('e3', 9999, null)],
    });
    renderApp('/proyectos/p1/tareas/t1');
    const costs = await screen.findByRole('region', { name: 'Costos de la tarea' });
    // toHaveTextContent normaliza los espacios del texto recibido, no los del esperado.
    const money = (cents: number) => formatMoney(cents, 'USD').replace(/\s+/g, ' ');
    expect(costs).toHaveTextContent(`Costo planeado${money(500000)}`);
    await waitFor(() => expect(costs).toHaveTextContent(`Gasto ligado${money(3500)}`));
  });

  it('el colaborador no ve los costos de la tarea', async () => {
    mockApi(base(collaborator, task()));
    renderApp('/proyectos/p1/tareas/t1');
    expect(await screen.findByRole('heading', { name: 'Diseño' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Costos de la tarea' })).not.toBeInTheDocument();
    expect(screen.queryByText('Costo planeado')).not.toBeInTheDocument();
  });
});

describe('gastos por tarea', () => {
  const budgetRoutes = {
    ...signedInAs(pmUser),
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/tasks': [task()],
    'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [], budget: { plannedCents: 0, spentCents: 0, differenceCents: 0 }, highRisks: 0 },
  };

  it('un gasto se liga a una tarea', async () => {
    const api = mockApi({ ...budgetRoutes, 'GET /api/projects/p1/expenses': [], 'POST /api/projects/p1/expenses': expense('e1', 1000, 't1') });
    renderApp('/proyectos/p1/presupuesto');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Descripción'), 'Licencia');
    await user.type(dialog.getByLabelText('Monto'), '10');
    await user.type(dialog.getByLabelText('Fecha'), '2026-11-01');
    await user.selectOptions(dialog.getByLabelText('Tarea (opcional)'), 'Diseño');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/expenses')?.body).toMatchObject({ taskId: 't1' }));
  });

  it('la tabla muestra la tarea de cada gasto', async () => {
    mockApi({ ...budgetRoutes, 'GET /api/projects/p1/expenses': [expense('e1', 1000, 't1'), expense('e2', 500, null)] });
    renderApp('/proyectos/p1/presupuesto');
    const table = await screen.findByRole('table');
    const row = (text: string) => within(table).getByText(text).closest('tr') as HTMLElement;
    expect(await within(row('Gasto e1')).findByText('Diseño')).toBeInTheDocument();
    expect(within(row('Gasto e2')).getByText('—')).toBeInTheDocument();
  });
});
