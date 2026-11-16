import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const NOTICE = 'Otra persona guardó cambios en este registro. Cargamos la versión actual; vuelve a aplicar tus cambios.';
const conflict = () => apiError(409, 'edit_conflict', { message: 'Otra persona guardó cambios en este registro mientras editabas' });
/** Devuelve los valores en orden; el último se repite. */
const sequence = (...values: unknown[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};
const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const members = [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: true }];

describe('choque al editar una tarea', () => {
  const task = (over: object = {}) => ({
    id: 't1',
    projectId: 'p1',
    milestoneId: null,
    title: 'Construcción',
    description: 'Levantar el sitio',
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    progress: 0,
    plannedCostCents: 0,
    version: 3,
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
    ancestors: [],
    children: [],
    ...over,
  });
  const routes = (getTask: unknown, patch: unknown) => ({
    ...signedInAs(pmUser),
    'GET /api/projects': [],
    'GET /api/me/tasks': [],
    'GET /api/projects/p1': project,
    'GET /api/tasks/t1': getTask,
    'GET /api/tasks/t1/attachments': [],
    'GET /api/projects/p1/tasks': [task()],
    'GET /api/projects/p1/members': members,
    'GET /api/projects/p1/milestones': [],
    'PATCH /api/tasks/t1': patch,
  });

  it('guardar manda la versión abierta', async () => {
    const api = mockApi(routes(task(), task({ version: 4 })));
    renderApp('/proyectos/p1/tareas/t1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/tasks/t1')?.body).toMatchObject({ version: 3 }));
  });

  it('ante un choque avisa y rellena el formulario con la versión actual', async () => {
    const api = mockApi(routes(sequence(task(), task({ title: 'Obra gruesa', version: 4 })), sequence(conflict(), task({ title: 'Mía', version: 5 }))));
    renderApp('/proyectos/p1/tareas/t1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.clear(dialog.getByLabelText('Título'));
    await user.type(dialog.getByLabelText('Título'), 'Mía');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    expect(await dialog.findByText(NOTICE)).toBeInTheDocument();
    expect(dialog.getByLabelText('Título')).toHaveValue('Obra gruesa');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key === 'PATCH /api/tasks/t1').at(-1)?.body).toMatchObject({ title: 'Obra gruesa', version: 4 }));
  });
});

describe('choque al editar un riesgo', () => {
  const risk = (over: object = {}) => ({
    id: 'r1',
    description: 'Retraso',
    type: 'THREAT',
    probability: 4,
    impact: 5,
    score: 20,
    response: 'MITIGATE',
    responsePlan: '',
    ownerId: 'c1',
    status: 'OPEN',
    version: 2,
    ...over,
  });
  const routes = (user: object, list: unknown, patch: unknown) => ({
    ...signedInAs(user),
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/members': members,
    'GET /api/projects/p1/risks': list,
    'PATCH /api/projects/p1/risks/r1': patch,
  });

  it('el PM ve el aviso y el formulario con la versión actual', async () => {
    const api = mockApi(routes(pmUser, sequence([risk()], [risk({ impact: 1, score: 4, version: 3 })]), sequence(conflict(), risk({ version: 4 }))));
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Retraso' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1/risks/r1')?.body).toMatchObject({ version: 2 }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText(NOTICE)).toBeInTheDocument();
    expect(dialog.getByLabelText('Impacto (1 a 5)')).toHaveValue('1');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key === 'PATCH /api/projects/p1/risks/r1').at(-1)?.body).toMatchObject({ impact: 1, version: 3 }));
  });

  it('el colaborador manda la versión al cambiar el estado y ante un choque avisa y recarga', async () => {
    const api = mockApi(routes(collaborator, [risk()], conflict()));
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    const gets = () => api.calls.filter((c) => c.key === 'GET /api/projects/p1/risks').length;
    await user.click(await screen.findByRole('button', { name: 'Ver Retraso' }));
    const before = gets();
    await user.selectOptions(within(await screen.findByRole('dialog')).getByLabelText('Estado del riesgo'), 'TREATING');
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1/risks/r1')?.body).toEqual({ status: 'TREATING', version: 2 }));
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
  });
});

describe('choque al editar un entregable', () => {
  const url = '/api/projects/p1/deliverables';
  const criteria = [{ id: 'c1', text: 'Funciona', met: true, position: 0 }];
  const row = (over: object = {}) => ({
    id: 'd2',
    number: 2,
    name: 'Portal publicado',
    status: 'PENDING',
    dueDate: null,
    overdue: false,
    milestone: null,
    criteriaMet: 1,
    criteriaTotal: 1,
    lastReview: null,
    version: 5,
    ...over,
  });
  const full = (over: object = {}) => ({ ...row(), description: '', criteria, reviews: [], work: [], ...over });
  const routes = (detail: unknown, patch: unknown) => ({
    ...signedInAs(pmUser),
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/milestones': [],
    'GET /api/projects/p1/stakeholders': [],
    'GET /api/projects/p1/attachments': [],
    [`GET ${url}`]: [row()],
    [`GET ${url}/d2`]: detail,
    [`PATCH ${url}/d2`]: patch,
  });
  const openDetail = async () => {
    renderApp('/proyectos/p1/entregables');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver ENT-2' }));
    return within(await screen.findByRole('dialog', { name: 'ENT-2 · Portal publicado' }));
  };

  it('el formulario ante un choque avisa y muestra la versión actual', async () => {
    let clashed = false;
    const api = mockApi(
      routes(
        () => (clashed ? full({ name: 'Portal nuevo', version: 6 }) : full()),
        () => (clashed ? full({ version: 7 }) : ((clashed = true), conflict())),
      ),
    );
    const dialog = await openDetail();
    const user = userEvent.setup();
    await user.click(await dialog.findByRole('button', { name: 'Editar' }));
    const edit = within(screen.getByRole('dialog', { name: 'Editar ENT-2' }));
    await user.click(edit.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/d2`)?.body).toMatchObject({ version: 5 }));
    expect(await edit.findByText(NOTICE)).toBeInTheDocument();
    expect(edit.getByLabelText('Nombre')).toHaveValue('Portal nuevo');
    await user.click(edit.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.filter((c) => c.key === `PATCH ${url}/d2`).at(-1)?.body).toMatchObject({ name: 'Portal nuevo', version: 6 }));
  });

  it('el botón de estado manda la versión y ante un choque avisa', async () => {
    const api = mockApi(routes(full(), conflict()));
    const dialog = await openDetail();
    await userEvent.setup().click(await dialog.findByRole('button', { name: 'Enviar a revisión' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/d2`)?.body).toEqual({ status: 'IN_REVIEW', version: 5 }));
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });
});
