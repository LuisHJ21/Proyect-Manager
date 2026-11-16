import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, observer, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const members = [
  { userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' },
  { userId: 'o1', name: 'Olga', email: '', role: 'OBSERVER', projectRole: 'Patrocinadora' },
];
const task = {
  id: 't1',
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
  successorCount: 0,
  commentCount: 0,
  stepsDone: 0,
  stepsTotal: 1,
  wbsCode: '1',
  parentId: null,
  position: 1,
  deliverableId: null,
  childCount: 0,
  isSummary: false,
  estimatedHours: null,
  ancestors: [],
  children: [],
  waitingOn: [],
  warnings: [],
  steps: [{ id: 's1', title: 'Paso', done: false, assignee: { id: 'c1', name: 'Carlos' } }],
};
const routes = (user: object) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': members,
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/tasks': [task],
  'GET /api/tasks/t1': task,
  'GET /api/tasks/t1/attachments': [],
  'GET /api/projects/p1/lessons': [],
  'GET /api/projects/p1/risks': [],
});

describe('el observador no ve controles de escritura', () => {
  it('en el detalle de tarea: sin comentarios, incidentes, anexos ni pasos marcables', async () => {
    mockApi(routes(observer));
    renderApp('/proyectos/p1/tareas/t1');
    expect(await screen.findByRole('heading', { name: '1 Construcción' })).toBeInTheDocument();
    expect(screen.queryByText('Comentarios')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Incidentes de la tarea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reportar incidente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adjuntar archivo/ })).not.toBeInTheDocument();
    for (const box of screen.queryAllByRole('checkbox', { name: /Paso/ })) expect(box).toBeDisabled();
  });

  it('en lecciones: sin Añadir lección', async () => {
    mockApi(routes(observer));
    renderApp('/proyectos/p1/lecciones');
    expect(await screen.findByText('Aún no hay lecciones aprendidas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir lección' })).not.toBeInTheDocument();
  });

  it('el colaborador sigue viendo Añadir lección', async () => {
    mockApi(routes(collaborator));
    renderApp('/proyectos/p1/lecciones');
    expect(await screen.findByRole('button', { name: 'Añadir lección' })).toBeInTheDocument();
  });
});

describe('los selectores no ofrecen observadores', () => {
  it('el formulario de tarea', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/tareas');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Nueva tarea' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByLabelText('Carlos')).toBeInTheDocument();
    expect(dialog.queryByLabelText('Olga')).not.toBeInTheDocument();
  });

  it('el responsable de un riesgo', async () => {
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/riesgos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Añadir riesgo' }));
    const owner = within(screen.getByLabelText('Responsable'));
    await waitFor(() => expect(owner.getByRole('option', { name: 'Carlos' })).toBeInTheDocument());
    expect(owner.queryByRole('option', { name: 'Olga' })).not.toBeInTheDocument();
  });
});

describe('perfil Observador en Usuarios', () => {
  const carlos = { ...collaborator, projects: [], openTasks: 2, overdueTasks: 0 };
  const base = { ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/users': [{ ...pmUser, projects: [], openTasks: 0, overdueTasks: 0 }, carlos] };

  it('ofrece Observador y explica el trabajo abierto que impide el cambio', async () => {
    mockApi({
      ...base,
      'PATCH /api/users/c1': apiError(409, 'observer_has_work', {
        message: 'Tiene trabajo abierto: reasígnalo antes de cambiar su perfil a Observador',
        details: { tasks: 2, steps: 0, risks: 1, incidents: 0 },
      }),
    });
    renderApp('/usuarios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar a Carlos' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('option', { name: 'Observador' })).toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Rol'), 'OBSERVER');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await dialog.findByText('Tiene trabajo abierto: reasígnalo antes de cambiar su perfil a Observador')).toBeInTheDocument();
    expect(dialog.getByText('2 tareas · 1 riesgo')).toBeInTheDocument();
  });
});
