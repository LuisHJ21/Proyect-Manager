import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';
import { wbsTask } from './wbsFixtures';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const carlos = { id: 'c1', name: 'Carlos' };
const detail = (over: Partial<TaskDetail> = {}): TaskDetail => ({
  ...wbsTask({ id: 't1', title: 'Construcción', assignees: [carlos], estimatedHours: 8 }),
  steps: [],
  comments: [],
  ancestors: [],
  children: [],
  ...over,
});
const entries = [
  { id: 'e1', taskId: 't1', date: '2026-11-16', hours: 2, note: 'Muros', user: carlos, createdAt: '2026-11-16T10:00:00Z', rateCents: 2000, costCents: 4000 },
  { id: 'e2', taskId: 't1', date: '2026-11-15', hours: 1.5, note: '', user: { id: 'u2', name: 'Beatriz' }, createdAt: '2026-11-15T10:00:00Z', rateCents: 2000, costCents: 3000 },
];
const withoutCost = entries.map(({ rateCents: _r, costCents: _c, ...e }) => e);
const members = [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: true, weeklyCapacityHours: 40 }];
const routes = (user: object, task: TaskDetail, list: object[], extra: object = {}) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/tasks/t1': task,
  'GET /api/tasks/t1/attachments': [],
  'GET /api/tasks/t1/time-entries': list,
  'GET /api/projects/p1/tasks': [task],
  'GET /api/projects/p1/members': members,
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/expenses': [],
  'GET /api/projects/p1/deliverables': [],
  ...extra,
});
const section = async () => within(await screen.findByRole('region', { name: 'Horas' }));

describe('horas de una tarea', () => {
  it('el responsable ve las horas, el total frente a lo estimado, y registra', async () => {
    const api = mockApi(routes(collaborator, detail(), withoutCost, { 'POST /api/tasks/t1/time-entries': withoutCost[0] }));
    renderApp('/proyectos/p1/tareas/t1');
    const hours = await section();
    expect(await hours.findByText('3,5 h de 8 h estimadas')).toBeInTheDocument();
    expect(hours.getByText('Muros')).toBeInTheDocument();
    expect(hours.queryByText('Costo')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(hours.getByLabelText('Horas'));
    await user.type(hours.getByLabelText('Horas'), '1,5');
    await user.type(hours.getByLabelText('Nota'), 'Techo');
    await user.click(hours.getByRole('button', { name: 'Registrar horas' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/tasks/t1/time-entries')?.body).toMatchObject({ hours: 1.5, note: 'Techo' }));
  });

  it('el PM ve el costo y el gasto ligado suma las horas', async () => {
    mockApi(routes(pmUser, detail({ plannedCostCents: 10000 }), entries));
    renderApp('/proyectos/p1/tareas/t1');
    const hours = await section();
    expect(await hours.findByText('Costo')).toBeInTheDocument();
    const costs = within(screen.getByRole('region', { name: 'Costos de la tarea' }));
    await waitFor(() => expect(costs.getByText('Gasto ligado').nextElementSibling).toHaveTextContent('70,00'));
  });

  it('en una tarea padre no se registran horas', async () => {
    mockApi(routes(pmUser, detail({ isSummary: true, childCount: 1, children: [{ id: 'h', title: 'Hija', wbsCode: '1.1' }] }), []));
    renderApp('/proyectos/p1/tareas/t1');
    await screen.findByRole('region', { name: 'Subtareas' });
    expect(screen.queryByRole('button', { name: 'Registrar horas' })).not.toBeInTheDocument();
  });

  it('el formulario de tarea envía las horas estimadas', async () => {
    const api = mockApi(routes(pmUser, detail(), [], { 'PATCH /api/tasks/t1': detail() }));
    renderApp('/proyectos/p1/tareas/t1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.clear(dialog.getByLabelText('Horas estimadas'));
    await user.type(dialog.getByLabelText('Horas estimadas'), '12,5');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1')?.body).toMatchObject({ estimatedHours: 12.5 }));
  });
});

describe('tarifa y capacidad de los miembros', () => {
  it('el PM edita tarifa y capacidad', async () => {
    const pmMembers = [{ ...members[0], hourlyRateCents: 2000 }];
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/members': pmMembers,
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
      'GET /api/projects/p1/objectives': [],
      'GET /api/projects/p1/milestones': [],
      'GET /api/users': [],
      'PATCH /api/projects/p1/members/c1': pmMembers[0],
    });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tarifa y capacidad de Carlos' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.clear(dialog.getByLabelText('Tarifa por hora'));
    await user.type(dialog.getByLabelText('Tarifa por hora'), '25');
    await user.clear(dialog.getByLabelText('Capacidad semanal (h)'));
    await user.type(dialog.getByLabelText('Capacidad semanal (h)'), '30');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1/members/c1')?.body).toEqual({ hourlyRateCents: 2500, weeklyCapacityHours: 30 }));
  });
});

describe('gasto de mano de obra', () => {
  it('avisa que la categoría es para trabajo externo', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/tasks': [],
      'GET /api/projects/p1/expenses': [],
      'GET /api/projects/p1/budget-categories': { items: [], teamLaborCents: 0, contingencyCents: 0, managementCents: 0, unallocatedCents: 0, overAllocated: false },
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [], budget: { plannedCents: 0, spentCents: 0, differenceCents: 0 }, highRisks: 0 },
    });
    renderApp('/proyectos/p1/presupuesto');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'LABOR');
    expect(dialog.getByText('Usa esta categoría para trabajo externo. Las horas del equipo ya suman su costo desde la tarifa de cada miembro.')).toBeInTheDocument();
  });
});

describe('carga semanal en el panel', () => {
  it('muestra cuatro semanas por persona y marca la sobrecargada', async () => {
    const weeks = [
      { start: '2026-11-16', assignedHours: 60, capacityHours: 50, overloaded: true },
      { start: '2026-11-23', assignedHours: 10, capacityHours: 50, overloaded: false },
      { start: '2026-11-30', assignedHours: 0, capacityHours: 50, overloaded: false },
      { start: '2026-12-07', assignedHours: 0, capacityHours: 50, overloaded: false },
    ];
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [],
      'GET /api/dashboard': {
        totals: { activeProjects: 1, atRiskProjects: 0, overdueTasks: 0, overdueProjects: 0, highRisks: 0, overBudgetProjects: 0 },
        projects: [],
        attention: [],
        workload: [{ userId: 'c1', name: 'Carlos', openTasks: 2, overdueTasks: 0, weeks }],
        upcomingMilestones: [],
      },
    });
    renderApp('/');
    const load = await screen.findByRole('list', { name: 'Carga semanal de Carlos' });
    expect(within(load).getAllByRole('listitem')).toHaveLength(4);
    expect(within(load).getAllByRole('listitem')[0]).toHaveTextContent('60 h / 50 h');
    expect(within(load).getAllByRole('listitem')[0]).toHaveTextContent('Sobrecargada');
    expect(within(load).getAllByRole('listitem')[1]).not.toHaveTextContent('Sobrecargada');
  });
});
