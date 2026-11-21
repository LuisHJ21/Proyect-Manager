import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '../src/api/types';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const incident = (over: object = {}) => ({
  id: 'i2',
  number: 2,
  title: 'Servidor caído',
  description: 'No responde',
  priority: 'HIGH',
  dueDate: '2026-11-01',
  status: 'OPEN',
  resolution: '',
  resolvedAt: null,
  closedAt: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  overdue: true,
  reportedBy: { id: 'c1', name: 'Carlos' },
  owner: null,
  task: null,
  risk: null,
  can: { edit: true, changeStatus: true, close: true },
  ...over,
});
const inProgress = incident({ id: 'i1', number: 1, title: 'Lentitud', priority: 'LOW', dueDate: null, overdue: false, status: 'IN_PROGRESS', owner: { id: 'u-ana', name: 'Ana' } });
const members = [
  { userId: 'u-ana', name: 'Ana', email: '', role: 'COLLABORATOR', projectRole: '' },
  { userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' },
];
const url = '/api/projects/p1/incidents';
const routes = (user: object, list: object[]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': members,
  'GET /api/projects/p1/tasks': [{ id: 't1', title: 'Construcción' }],
  [`GET ${url}`]: list,
  [`GET ${url}?status=RESOLVED`]: [],
  [`GET ${url}?mine=1`]: [inProgress],
});
const open = () => renderApp('/proyectos/p1/incidentes');

describe('pestaña Incidentes', () => {
  it('lista con prioridad, responsable y vencido', async () => {
    mockApi(routes(pmUser, [incident(), inProgress]));
    open();
    const table = await screen.findByRole('table');
    const row = (code: string) => within(table).getByText(code).closest('tr') as HTMLElement;
    await within(table).findByText('INC-2');
    expect(row('INC-2')).toHaveTextContent('Alta');
    expect(row('INC-2')).toHaveTextContent('Sin responsable');
    expect(row('INC-2')).toHaveTextContent('Vencido');
    expect(row('INC-1')).toHaveTextContent('Ana');
    expect(row('INC-1')).toHaveTextContent('En curso');
  });

  it('la caja de la tabla contiene el texto oculto de la cabecera, para no ensanchar la página en móvil', async () => {
    mockApi(routes(pmUser, [incident()]));
    open();
    const table = await screen.findByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto', 'relative');
  });

  it('filtros por estado y míos', async () => {
    const api = mockApi(routes(pmUser, [incident()]));
    open();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Estado'), 'RESOLVED');
    await waitFor(() => expect(api.calls.some((c) => c.key === `GET ${url}?status=RESOLVED`)).toBe(true));
    await user.selectOptions(screen.getByLabelText('Estado'), '');
    await user.click(screen.getByLabelText('Míos'));
    await waitFor(() => expect(api.calls.some((c) => c.key === `GET ${url}?mine=1`)).toBe(true));
  });

  it('el colaborador no ve la casilla Míos y reporta solo título, descripción y tarea', async () => {
    const api = mockApi({ ...routes(collaborator, []), [`POST ${url}`]: incident() });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reportar incidente' }));
    expect(screen.queryByLabelText('Míos')).not.toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog', { name: 'Reportar incidente' }));
    expect(dialog.queryByLabelText('Responsable')).not.toBeInTheDocument();
    expect(dialog.queryByLabelText('Prioridad')).not.toBeInTheDocument();
    await user.type(dialog.getByLabelText('Título'), 'Sin acceso a la base');
    await user.type(dialog.getByLabelText('Descripción'), 'Error de conexión');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toEqual({ title: 'Sin acceso a la base', description: 'Error de conexión', taskId: null }),
    );
  });

  it('el PM reporta con responsable, prioridad y fecha', async () => {
    const api = mockApi({ ...routes(pmUser, []), [`POST ${url}`]: incident() });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reportar incidente' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Título'), 'Caída');
    await user.selectOptions(dialog.getByLabelText('Responsable'), 'u-ana');
    await user.selectOptions(dialog.getByLabelText('Prioridad'), 'HIGH');
    await user.type(dialog.getByLabelText('Fecha límite'), '2026-11-20');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toMatchObject({ title: 'Caída', ownerId: 'u-ana', priority: 'HIGH', dueDate: '2026-11-20' }),
    );
  });

  it('acciones según can: el responsable avanza y resuelve', async () => {
    const own = incident({ owner: { id: 'c1', name: 'Carlos' }, can: { edit: false, changeStatus: true, close: false } });
    const api = mockApi({ ...routes(collaborator, [own]), [`PATCH ${url}/i2`]: own });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver INC-2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'INC-2 · Servidor caído' }));
    expect(dialog.getByRole('button', { name: 'Marcar en curso' })).toBeInTheDocument();
    for (const name of ['Editar', 'Cerrar', 'Eliminar']) expect(dialog.queryByRole('button', { name })).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Resolver' }));
    const resolve = within(screen.getByRole('dialog', { name: 'Resolver INC-2' }));
    const confirm = resolve.getByRole('button', { name: 'Resolver' });
    expect(confirm).toBeDisabled();
    await user.type(resolve.getByLabelText('Resolución'), 'Se reinició');
    await user.click(confirm);
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/i2`)?.body).toEqual({ status: 'RESOLVED', resolution: 'Se reinició' }));
  });

  it('cerrar con decisión', async () => {
    const resolved = incident({ status: 'RESOLVED', resolution: 'Listo' });
    const api = mockApi({ ...routes(pmUser, [resolved]), [`PATCH ${url}/i2`]: { ...resolved, status: 'CLOSED' } });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver INC-2' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    const close = within(screen.getByRole('dialog', { name: 'Cerrar INC-2' }));
    await user.click(close.getByLabelText('Registrar como decisión'));
    await user.click(close.getByRole('button', { name: 'Cerrar incidente' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/i2`)?.body).toEqual({ status: 'CLOSED', recordDecision: true }));
  });

  it('un 404 cierra el detalle y avisa', async () => {
    const own = incident({ owner: { id: 'c1', name: 'Carlos' }, can: { edit: false, changeStatus: true, close: false } });
    mockApi({ ...routes(collaborator, [own]), [`PATCH ${url}/i2`]: apiError(404, 'not_found', { message: 'Incidente no encontrado' }) });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver INC-2' }));
    await user.click(screen.getByRole('button', { name: 'Marcar en curso' }));
    expect(await screen.findByText('Ya no tienes acceso a este incidente')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('el colaborador ve la pestaña Incidentes', async () => {
    mockApi(routes(collaborator, []));
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Incidentes' })).toBeInTheDocument();
    expect(await screen.findByText('No hay incidentes.')).toBeInTheDocument();
  });
});

describe('reportar desde una tarea', () => {
  const task: TaskDetail = {
    ancestors: [],
    children: [],
    id: 't1',
    version: 1,
    projectId: 'p1',
    milestoneId: null,
    title: 'Construcción',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    progress: 0,
    assignees: [{ id: 'c1', name: 'Carlos' }],
    predecessorIds: [],
    predecessors: [],
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
    comments: [],
    steps: [],
    incidents: [{ id: 'i3', number: 3, title: 'Error en el despliegue', status: 'OPEN' }],
  };

  it('deja la tarea elegida y lista los incidentes de la tarea', async () => {
    const api = mockApi({
      ...signedInAs(collaborator),
      'GET /api/projects': [],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project,
      'GET /api/tasks/t1': task,
      'GET /api/tasks/t1/attachments': [],
      'GET /api/projects/p1/tasks': [task],
      'GET /api/projects/p1/members': members,
      'GET /api/projects/p1/milestones': [],
      [`POST ${url}`]: incident(),
    });
    renderApp('/proyectos/p1/tareas/t1');
    const section = await screen.findByRole('region', { name: 'Incidentes de la tarea' });
    expect(within(section).getByText(/INC-3/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reportar incidente' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Tarea')).toHaveValue('Construcción');
    expect(dialog.getByLabelText('Tarea')).toHaveAttribute('readonly');
    expect(dialog.queryByRole('combobox', { name: 'Tarea' })).not.toBeInTheDocument();
    await user.type(dialog.getByLabelText('Título'), 'Falla');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toMatchObject({ taskId: 't1' }));
  });
});
