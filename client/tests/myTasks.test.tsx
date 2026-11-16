import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../src/api/types';
import { groupMyTasks } from '../src/lib/myTasks';
import { apiError, collaborator, mockApi, renderApp, signedInAs } from './helpers';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  version: 1,
  projectId: 'p1',
  milestoneId: null,
  title: 'Tarea',
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
  projectName: 'Portal',
  ...over,
});

const TODAY = '2026-11-07';

describe('groupMyTasks', () => {
  const list = [
    task({ id: 'v', dueDate: '2026-11-06' }),
    task({ id: 'h', dueDate: TODAY }),
    task({ id: 'p', dueDate: '2026-11-08' }),
    task({ id: 's' }),
    task({ id: 'd', dueDate: '2026-11-01', status: 'DONE' }),
  ];
  it('agrupa en vencidas, hoy, próximas y sin fecha, sin terminadas', () => {
    const groups = groupMyTasks(list, TODAY);
    expect(groups.overdue.map((t) => t.id)).toEqual(['v']);
    expect(groups.today.map((t) => t.id)).toEqual(['h']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['p']);
    expect(groups.undated.map((t) => t.id)).toEqual(['s']);
  });
  it('con includeDone una terminada no cuenta como vencida', () => {
    const groups = groupMyTasks(list, TODAY, { includeDone: true });
    expect(groups.overdue.map((t) => t.id)).toEqual(['v']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['p', 'd']);
  });
});

describe('Mis tareas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 7, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  const open = async (tasks: Task[], extra: object = {}) => {
    const api = mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': tasks, ...extra });
    renderApp('/mis-tareas');
    return { api, user: userEvent.setup(), main: within(await screen.findByRole('main')) };
  };

  it('muestra los grupos con proyecto y fecha', async () => {
    const { main } = await open([task({ title: 'Atrasada', dueDate: '2026-11-01' }), task({ id: 't2', title: 'De hoy', dueDate: TODAY })]);
    expect(await main.findByRole('heading', { name: 'Vencidas' })).toBeInTheDocument();
    expect(main.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
    expect(main.queryByRole('heading', { name: 'Sin fecha' })).not.toBeInTheDocument();
    expect(main.getAllByText('Portal')).toHaveLength(2);
  });

  it('el título enlaza al detalle de la tarea', async () => {
    const { main } = await open([task({ title: 'Mi tarea' })]);
    expect(await main.findByRole('link', { name: 'Mi tarea' })).toHaveAttribute('href', '/proyectos/p1/tareas/t1');
  });

  it('marcar la casilla envía DONE y desmarcarla IN_PROGRESS', async () => {
    const { api, main, user } = await open([task({ title: 'A' }), task({ id: 't2', title: 'B', status: 'DONE' })], {
      'PATCH /api/tasks/t1/progress': task(),
      'PATCH /api/tasks/t2/progress': task(),
    });
    await user.click(await main.findByRole('checkbox', { name: 'Marcar A como hecha' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1/progress')?.body).toEqual({ status: 'DONE' }));
    await user.click(main.getByLabelText('Mostrar terminadas'));
    await user.click(main.getByRole('checkbox', { name: 'Marcar B como hecha' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t2/progress')?.body).toEqual({ status: 'IN_PROGRESS' }));
  });

  it('doble clic envía una sola solicitud', async () => {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve(task({ status: 'DONE' })), 200));
    const { api, main, user } = await open([task({ title: 'A' })], { 'PATCH /api/tasks/t1/progress': slow });
    await user.dblClick(await main.findByRole('checkbox', { name: 'Marcar A como hecha' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key.startsWith('PATCH')).length).toBeGreaterThan(0));
    expect(api.calls.filter((c) => c.key.startsWith('PATCH'))).toHaveLength(1);
  });

  it('ante 409 la casilla vuelve a su estado y muestra el motivo', async () => {
    const { main, user } = await open([task({ title: 'A' })], {
      'PATCH /api/tasks/t1/progress': apiError(409, 'predecessors_pending', { message: 'Antes deben terminar: Diseño' }),
    });
    const box = await main.findByRole('checkbox', { name: 'Marcar A como hecha' });
    await user.click(box);
    expect(await screen.findByText('Antes deben terminar: Diseño')).toBeInTheDocument();
    expect(main.getByRole('checkbox', { name: 'Marcar A como hecha' })).not.toBeChecked();
  });

  it('las terminadas se muestran al activar el control', async () => {
    const { main, user } = await open([task({ title: 'Lista', status: 'DONE' })]);
    expect(await main.findByText('No tienes tareas pendientes.')).toBeInTheDocument();
    await user.click(main.getByLabelText('Mostrar terminadas'));
    expect(main.getByRole('link', { name: 'Lista' })).toHaveClass('line-through');
  });
});
