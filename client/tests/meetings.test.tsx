import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, closedAt: null };
const agreement = (over: object = {}) => ({ id: 'a1', text: 'Enviar minuta', owner: null, dueDate: null, position: 0, taskId: null, decisionId: null, incidentId: null, convertedTo: null, ...over });
const meeting = (over: object = {}) => ({
  id: 'm1',
  title: 'Seguimiento',
  date: '2026-11-16',
  notes: '<p>Se revisó el avance</p>',
  createdAt: '2026-11-16T10:00:00Z',
  updatedAt: '2026-11-16T10:00:00Z',
  attendees: { users: [{ id: 'c1', name: 'Carlos' }], stakeholders: [{ id: 's1', name: 'Patrocinador' }] },
  agreements: [agreement()],
  ...over,
});
const base = (user: object) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/stakeholders': [{ id: 's1', name: 'Patrocinador' }],
});

describe('actas de reunión', () => {
  it('el PM convierte un acuerdo en tarea', async () => {
    const api = mockApi({
      ...base(pmUser),
      'GET /api/projects/p1/meetings/m1': meeting(),
      'POST /api/projects/p1/meetings/m1/agreements/a1/convert': agreement({ taskId: 't9', convertedTo: 'task' }),
    });
    renderApp('/proyectos/p1/reuniones/m1');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Seguimiento' })).toBeInTheDocument();
    expect(screen.getByText('Patrocinador')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/meetings/m1/agreements/a1/convert')?.body).toEqual({ kind: 'task' }));
  });

  it('un acuerdo convertido enlaza a lo creado', async () => {
    mockApi({ ...base(pmUser), 'GET /api/projects/p1/meetings/m1': meeting({ agreements: [agreement({ taskId: 't9', convertedTo: 'task' })] }) });
    renderApp('/proyectos/p1/reuniones/m1');
    expect(await screen.findByRole('link', { name: 'Ver tarea' })).toHaveAttribute('href', '/proyectos/p1/tareas/t9');
    expect(screen.queryByRole('button', { name: 'Crear tarea' })).not.toBeInTheDocument();
  });

  it('el colaborador ve el acta sin botones de conversión ni editar', async () => {
    mockApi({
      ...base(collaborator),
      'GET /api/projects/p1/meetings/m1': meeting({ attendees: { users: [{ id: 'c1', name: 'Carlos' }], stakeholders: [] }, agreements: [agreement({ convertedTo: 'decision' })] }),
    });
    renderApp('/proyectos/p1/reuniones/m1');
    expect(await screen.findByText('Convertido en decisión')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear tarea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('al editar, quien ya no es miembro sigue como asistente y responsable', async () => {
    mockApi({
      ...base(pmUser),
      'GET /api/projects/p1/meetings/m1': meeting({
        attendees: { users: [{ id: 'u-ana', name: 'Ana' }], stakeholders: [] },
        agreements: [agreement({ owner: { id: 'u-ana', name: 'Ana' }, taskId: 't9', convertedTo: 'task' })],
      }),
    });
    renderApp('/proyectos/p1/reuniones/m1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar reunión' }));
    expect(dialog.getByRole('checkbox', { name: 'Ana (ya no es miembro)' })).toBeChecked();
    expect(dialog.getByLabelText('Responsable del acuerdo 1')).toHaveValue('u-ana');
    expect(within(dialog.getByLabelText('Responsable del acuerdo 1')).getByRole('option', { name: 'Ana (ya no es miembro)' })).toBeInTheDocument();
  });

  it('muestra el error de un acuerdo vacío en su fila', async () => {
    mockApi({
      ...base(pmUser),
      'GET /api/projects/p1/meetings': [],
      'POST /api/projects/p1/meetings': apiError(400, 'validation_error', { fields: { 'agreements.0.text': 'Escribe el acuerdo' } }),
    });
    renderApp('/proyectos/p1/reuniones');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nueva reunión' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nueva reunión' }));
    await user.click(dialog.getByRole('button', { name: 'Añadir acuerdo' }));
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await dialog.findByText('Escribe el acuerdo')).toBeInTheDocument();
  });

  it('el PM crea una reunión con asistentes y acuerdos; el formulario avisa que los asistentes verán las notas', async () => {
    const api = mockApi({
      ...base(pmUser),
      'GET /api/projects/p1/meetings': [],
      'POST /api/projects/p1/meetings': meeting(),
      'GET /api/projects/p1/meetings/m1': meeting(),
    });
    renderApp('/proyectos/p1/reuniones');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nueva reunión' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nueva reunión' }));
    expect(dialog.getByText('Los asistentes del equipo verán estas notas')).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Título'), 'Seguimiento');
    await user.type(dialog.getByLabelText('Fecha'), '2026-11-16');
    await user.click(dialog.getByRole('checkbox', { name: 'Carlos' }));
    await user.click(dialog.getByRole('checkbox', { name: 'Patrocinador' }));
    await user.click(dialog.getByRole('button', { name: 'Añadir acuerdo' }));
    await user.type(dialog.getByLabelText('Acuerdo 1'), 'Enviar minuta');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/meetings')?.body).toMatchObject({
        title: 'Seguimiento',
        date: '2026-11-16',
        userIds: ['c1'],
        stakeholderIds: ['s1'],
        agreements: [{ text: 'Enviar minuta', ownerId: null, dueDate: null }],
      }),
    );
  });
});
