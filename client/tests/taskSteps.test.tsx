import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const carlos = { id: 'c1', name: 'Carlos' };
const detail = (over: Partial<TaskDetail> = {}): TaskDetail => ({
  id: 't1',
  projectId: 'p1',
  milestoneId: null,
  title: 'Construir',
  description: '',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  startDate: null,
  dueDate: null,
  progress: 50,
  assignees: [carlos],
  predecessorIds: [],
  successorCount: 0,
  commentCount: 0,
  stepsDone: 1,
  stepsTotal: 2,
  waitingOn: [],
  warnings: [],
  comments: [],
  steps: [
    { id: 's1', title: 'Estructura', done: true, assignee: carlos },
    { id: 's2', title: 'Pruebas', done: false, assignee: null },
  ],
  ...over,
});
const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };

const routes = (task: TaskDetail, user: object) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: true }],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/tasks': [task],
  'GET /api/tasks/t1': task,
  'GET /api/tasks/t1/attachments': [],
});

const open = async (extra: object = {}, task = detail(), user: object = pmUser) => {
  const api = mockApi({ ...routes(task, user), ...extra });
  renderApp('/proyectos/p1/tareas/t1');
  const section = within(await screen.findByRole('region', { name: 'Pasos' }));
  return { api, section, user: userEvent.setup() };
};

describe('pasos en el detalle', () => {
  it('muestra "N de M completados", barra y personas', async () => {
    const { section } = await open();
    expect(section.getByText('1 de 2 completados')).toBeInTheDocument();
    expect(section.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(section.getByRole('checkbox', { name: 'Estructura' })).toBeChecked();
    expect(section.getByRole('list')).toHaveTextContent('Carlos');
  });

  it('el PM añade, con persona entre los asignados', async () => {
    const { api, section, user } = await open({ 'POST /api/tasks/t1/steps': { id: 's3' } });
    await user.type(section.getByLabelText('Nuevo paso'), 'Publicar');
    await user.selectOptions(section.getByLabelText('Persona del nuevo paso'), 'c1');
    await user.click(section.getByRole('button', { name: 'Añadir paso' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/tasks/t1/steps')?.body).toEqual({ title: 'Publicar', assigneeId: 'c1' }));
  });

  it('el PM edita y elimina', async () => {
    const { api, section, user } = await open({ 'PATCH /api/tasks/t1/steps/s2': {}, 'DELETE /api/tasks/t1/steps/s2': { ok: true } });
    await user.click(section.getByRole('button', { name: 'Editar paso Pruebas' }));
    const form = within(await screen.findByRole('dialog'));
    await user.clear(form.getByLabelText('Título'));
    await user.type(form.getByLabelText('Título'), 'Pruebas finales');
    await user.click(form.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1/steps/s2')?.body).toEqual({ title: 'Pruebas finales', assigneeId: null }));
    await user.click(section.getByRole('button', { name: 'Eliminar paso Pruebas' }));
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'DELETE /api/tasks/t1/steps/s2')).toBe(true));
  });

  it('el colaborador asignado solo marca', async () => {
    const { api, section, user } = await open({ 'PATCH /api/tasks/t1/steps/s2': {} }, detail(), collaborator);
    expect(section.queryByLabelText('Nuevo paso')).not.toBeInTheDocument();
    expect(section.queryByRole('button', { name: 'Eliminar paso Pruebas' })).not.toBeInTheDocument();
    await user.click(section.getByRole('checkbox', { name: 'Pruebas' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1/steps/s2')?.body).toEqual({ done: true }));
  });

  it('un colaborador no asignado solo lee', async () => {
    const { section } = await open({}, detail({ assignees: [{ id: 'otra', name: 'Otra' }] }), collaborator);
    expect(section.getByRole('checkbox', { name: 'Pruebas' })).toBeDisabled();
  });

  it('doble clic en una casilla envía una sola solicitud', async () => {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve({}), 200));
    const { api, section, user } = await open({ 'PATCH /api/tasks/t1/steps/s2': slow });
    await user.dblClick(section.getByRole('checkbox', { name: 'Pruebas' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key.startsWith('PATCH')).length).toBeGreaterThan(0));
    expect(api.calls.filter((c) => c.key.startsWith('PATCH'))).toHaveLength(1);
  });

  it('ante 409 la casilla vuelve a su estado y muestra el motivo', async () => {
    const { section, user } = await open({ 'PATCH /api/tasks/t1/steps/s2': apiError(409, 'predecessors_pending', { message: 'Antes deben terminar: Diseño' }) });
    await user.click(section.getByRole('checkbox', { name: 'Pruebas' }));
    expect(await screen.findByText('Antes deben terminar: Diseño')).toBeInTheDocument();
    expect(section.getByRole('checkbox', { name: 'Pruebas' })).not.toBeChecked();
  });

  it('con pasos, el avance es de solo lectura y no se envía', async () => {
    const { api, user } = await open({ 'PATCH /api/tasks/t1/progress': {} });
    expect(screen.queryByLabelText('Avance (%)')).not.toBeInTheDocument();
    expect(screen.getByText('Se calcula con los pasos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar avance' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1/progress')?.body).toEqual({ status: 'IN_PROGRESS' }));
  });

  it('sin pasos el avance se edita como antes', async () => {
    await open({}, detail({ steps: [], stepsDone: 0, stepsTotal: 0 }));
    expect(screen.getByLabelText('Avance (%)')).toBeInTheDocument();
  });

  it('sin pasos, un colaborador no asignado no ve la sección vacía editable', async () => {
    const { section } = await open({}, detail({ steps: [], stepsDone: 0, stepsTotal: 0, assignees: [] }), collaborator);
    expect(section.getByText('Sin pasos.')).toBeInTheDocument();
  });
});
