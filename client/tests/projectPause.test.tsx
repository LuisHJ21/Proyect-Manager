import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const base = { id: 'p1', name: 'Portal', description: '', approach: 'PREDICTIVE', startDate: '2026-10-01', endDate: '2026-12-31', plannedBudgetCents: 0, currency: 'USD', closedAt: null };
const running = { ...base, status: 'EXECUTING', activePause: null };
const paused = { ...base, status: 'PAUSED', activePause: { pausedOn: '2026-11-01', reason: 'Prioridad de gerencia', priorityProject: { id: 'p2', name: 'Obra urgente' } } };
const preview = (days: number) => ({
  proposedDays: 15,
  days,
  hasBaseline: true,
  changes: {
    tasks: [{ id: 't1', name: 'Diseño', from: { startDate: '2026-11-20', dueDate: '2026-11-25' }, to: { startDate: '2026-12-05', dueDate: '2026-12-10' } }],
    milestones: [{ id: 'm1', name: 'Entrega', from: '2026-11-30', to: '2026-12-15' }],
    endDate: { from: '2026-12-31', to: '2027-01-15' },
  },
});
const routes = (user: object, project: object) => ({
  ...signedInAs(user),
  'GET /api/projects': [
    { ...running, team: [] },
    { ...running, id: 'p2', name: 'Obra urgente', team: [] },
    { ...running, id: 'p3', name: 'Archivo', status: 'CLOSED', team: [] },
  ],
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
  'GET /api/projects/p1/milestone-trend': [],
  'GET /api/projects/p1/objectives': [],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/pauses': [],
});

describe('pausar y reanudar un proyecto', () => {
  it('el PM pausa con motivo y ve a quién afecta', async () => {
    const api = mockApi({
      ...routes(pmUser, running),
      'GET /api/projects/p1/pause-impact?priorityProjectId=p2': { shared: [{ userId: 'ana', name: 'Ana', hours: [{ projectId: 'p1', total: 12 }, { projectId: 'p2', total: 6 }] }] },
      'POST /api/projects/p1/pause': { ...paused },
    });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Pausar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Pausar proyecto' }));
    const select = dialog.getByLabelText('Proyecto que pasa a tener prioridad');
    expect(within(select).queryByRole('option', { name: 'Archivo' })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Portal' })).not.toBeInTheDocument();
    await user.selectOptions(select, 'p2');
    expect(await dialog.findByText('Ana: 12 h aquí · 6 h en Obra urgente')).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Motivo'), 'Prioridad de gerencia');
    await user.click(dialog.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/pause')?.body).toEqual({ reason: 'Prioridad de gerencia', priorityProjectId: 'p2' }));
  });

  it('sin personas compartidas lo dice', async () => {
    mockApi({ ...routes(pmUser, running), 'GET /api/projects/p1/pause-impact?priorityProjectId=p2': { shared: [] } });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Pausar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Pausar proyecto' }));
    await user.selectOptions(dialog.getByLabelText('Proyecto que pasa a tener prioridad'), 'p2');
    expect(await dialog.findByText('No comparten personas: este proyecto puede seguir avanzando')).toBeInTheDocument();
  });

  it('el colaborador ve el aviso de pausa sin botones', async () => {
    mockApi(routes(collaborator, { ...paused, activePause: { ...paused.activePause, priorityProject: null } }));
    renderApp('/proyectos/p1/resumen');
    const status = await screen.findByText('En pausa desde el 1 nov 2026: Prioridad de gerencia');
    expect(status).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reanudar proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pausar proyecto' })).not.toBeInTheDocument();
  });

  it('el PM reanuda con vista previa y otro número de días', async () => {
    const api = mockApi({
      ...routes(pmUser, paused),
      'GET /api/projects/p1/resume-preview': preview(15),
      'GET /api/projects/p1/resume-preview?days=3': preview(3),
      'POST /api/projects/p1/resume': running,
    });
    renderApp('/proyectos/p1/resumen');
    expect(await screen.findByText('En pausa desde el 1 nov 2026: Prioridad de gerencia · prioridad: Obra urgente')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reanudar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reanudar proyecto' }));
    const days = await dialog.findByLabelText('Días a correr');
    await waitFor(() => expect(days).toHaveValue('15'));
    expect(dialog.getByText('Diseño')).toBeInTheDocument();
    expect(dialog.getByText('Entrega')).toBeInTheDocument();
    expect(dialog.getByRole('checkbox', { name: 'Crear una nueva línea base' })).toBeChecked();
    await user.clear(days);
    await user.type(days, '3');
    await waitFor(() => expect(api.calls.some((c) => c.key === 'GET /api/projects/p1/resume-preview?days=3')).toBe(true));
    await user.click(dialog.getByRole('button', { name: 'Reanudar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/resume')?.body).toEqual({ days: 3, createBaseline: true }));
  });

  it('si la línea base no se puede crear lo dice y reanuda sin ella', async () => {
    const api = mockApi({
      ...routes(pmUser, paused),
      'GET /api/projects/p1/resume-preview': { ...preview(15), baselineProblem: 'Todas las tareas con costo necesitan fecha de inicio y de fin' },
      'POST /api/projects/p1/resume': running,
    });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reanudar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reanudar proyecto' }));
    expect(await dialog.findByText(/No se puede crear una nueva línea base: Todas las tareas con costo necesitan fecha de inicio y de fin/)).toBeInTheDocument();
    const box = dialog.getByRole('checkbox', { name: 'Crear una nueva línea base' });
    expect(box).not.toBeChecked();
    expect(box).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Reanudar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/resume')?.body).toEqual({ days: 15, createBaseline: false }));
  });

  it('editar un proyecto en pausa no envía el estado', async () => {
    const api = mockApi({ ...routes(pmUser, paused), 'PATCH /api/projects/p1': paused });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar proyecto' }));
    expect(dialog.getByText('En pausa · usa Reanudar proyecto')).toBeInTheDocument();
    await user.clear(dialog.getByLabelText('Nombre'));
    await user.type(dialog.getByLabelText('Nombre'), 'Portal nuevo');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1')).toBeDefined());
    const body = api.calls.find((c) => c.key === 'PATCH /api/projects/p1')!.body as Record<string, unknown>;
    expect(body.name).toBe('Portal nuevo');
    expect(body).not.toHaveProperty('status');
  });

  it('el formulario no ofrece «En pausa» como estado', async () => {
    mockApi(routes(pmUser, running));
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    const select = within(screen.getByRole('dialog', { name: 'Editar proyecto' })).getByLabelText('Estado');
    expect(within(select).queryByRole('option', { name: 'En pausa' })).not.toBeInTheDocument();
  });

  it('el resumen muestra el historial de pausas al PM', async () => {
    mockApi({
      ...routes(pmUser, running),
      'GET /api/projects/p1/pauses': [{ pausedOn: '2026-10-01', resumedOn: '2026-10-11', reason: 'Prioridad de gerencia', shiftDays: 10, priorityProject: { id: 'p2', name: 'Obra urgente' } }],
    });
    renderApp('/proyectos/p1/resumen');
    const region = await screen.findByRole('region', { name: 'Pausas' });
    expect(within(region).getByText('Prioridad de gerencia')).toBeInTheDocument();
    expect(within(region).getByText('Obra urgente')).toBeInTheDocument();
    expect(within(region).getByText('10 días')).toBeInTheDocument();
  });
});
