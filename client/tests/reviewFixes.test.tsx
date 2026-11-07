import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../src/api/types';
import { TaskForm } from '../src/components/tasks/TaskForm';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs, wrap } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'PLANNING', approach: 'AGILE', startDate: null, endDate: null };
const charter = {
  justification: '',
  scopeIncluded: '',
  scopeExcluded: '',
  boundaries: '',
  assumptions: '',
  constraints: '',
  successCriteria: '',
  sponsor: '',
  status: 'DRAFT',
  approvedAt: null,
  approvedBy: null,
};
const down = apiError(500, 'internal_error', { message: 'Servidor caído' });

const refocus = async () => {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
};

afterEach(() => focusManager.setFocused(undefined));

describe('fallos al volver a la ventana', () => {
  it('un fallo en segundo plano no borra el acta que se está escribiendo', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects/p1': project, 'GET /api/projects/p1/charter': charter });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Justificación'), 'Texto sin guardar');

    for (const key of ['GET /api/setup/status', 'GET /api/auth/me', 'GET /api/projects/p1', 'GET /api/projects/p1/charter']) {
      api.routes[key] = down;
    }
    const before = api.calls.length;
    await refocus();
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByLabelText('Justificación')).toHaveValue('Texto sin guardar');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('un fallo en segundo plano no cierra el formulario de nuevo usuario', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/users': [{ ...pmUser, projects: [], openTasks: 0, overdueTasks: 0 }] });
    renderApp('/usuarios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await user.type(screen.getByLabelText('Nombre'), 'Bea');
    api.routes['GET /api/users'] = down;
    const before = api.calls.length;
    await refocus();
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByLabelText('Nombre')).toHaveValue('Bea');
  });

  it('si el proyecto ya no es accesible, muestra "no encontrado" aunque hubiera datos', async () => {
    const api = mockApi({ ...signedInAs(collaborator), 'GET /api/projects/p1': project, 'GET /api/projects/p1/charter': charter });
    renderApp('/proyectos/p1/acta');
    await screen.findByText('Borrador');
    api.routes['GET /api/projects/p1'] = apiError(404, 'not_found', { message: 'Proyecto no encontrado' });
    await refocus();
    expect(await screen.findByText('Proyecto no encontrado')).toBeInTheDocument();
  });
});

describe('contraseña temporal', () => {
  it('sin dato de configuración inicial, igual muestra el cambio de contraseña', async () => {
    mockApi({
      'GET /api/setup/status': apiError(403, 'password_change_required', { message: 'Debes cambiar tu contraseña para continuar' }),
      'GET /api/auth/me': { ...collaborator, mustChangePassword: true },
    });
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });
});

describe('formulario de tarea', () => {
  const task = {
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
    assignees: [{ id: 'c1', name: 'Carlos' }],
    predecessorIds: [],
    successorCount: 0,
    commentCount: 0,
    waitingOn: [],
    warnings: [],
  } as Task;

  it('marca a los inactivos y guarda campos y asignados en una sola solicitud', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: false }],
      'GET /api/projects/p1/milestones': [],
      'PATCH /api/tasks/t1': task,
    });
    wrap(<TaskForm projectId="p1" task={task} onClose={() => {}} />);
    expect(await screen.findByText(/Carlos \(inactivo\)/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar tarea' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'PATCH /api/tasks/t1');
      expect((call?.body as { assigneeIds: string[] }).assigneeIds).toEqual(['c1']);
    });
    expect(api.calls.some((c) => c.key === 'PUT /api/tasks/t1/assignees')).toBe(false);
  });

  it('no ofrece asignar a un inactivo que no estaba asignado', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1/members': [{ userId: 'c2', name: 'Ana', email: '', role: 'COLLABORATOR', projectRole: '', active: false }],
      'GET /api/projects/p1/milestones': [],
    });
    wrap(<TaskForm projectId="p1" onClose={() => {}} />);
    await screen.findByRole('button', { name: 'Guardar tarea' });
    await waitFor(() => expect(screen.getByText('Asignados')).toBeInTheDocument());
    expect(screen.queryByText(/Ana/)).not.toBeInTheDocument();
  });
});
