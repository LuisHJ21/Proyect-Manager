import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Task, TaskDetail } from '../src/api/types';
import { AttachmentList } from '../src/components/attachments/AttachmentList';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs, wrap } from './helpers';

const detail = (over: Partial<TaskDetail> = {}): TaskDetail => ({
  ancestors: [],
  children: [],
  id: 't1',
  version: 1,
  projectId: 'p1',
  milestoneId: null,
  title: 'Construcción',
  description: 'Levantar el sitio',
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
  ...over,
});
const other: Task = { ...detail({ id: 't2', title: 'Diseño' }) };

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };

const routes = (task: TaskDetail, user: object = pmUser) => ({
  ...signedInAs(user),
  'GET /api/projects': [],
  'GET /api/me/tasks': [],
  'GET /api/projects/p1': project,
  'GET /api/tasks/t1': task,
  'GET /api/tasks/t1/attachments': [],
  'GET /api/projects/p1/tasks': [task, other],
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/milestones': [],
});

const open = () => renderApp('/proyectos/p1/tareas/t1');

describe('detalle de tarea', () => {
  it('muestra las advertencias de dependencias', async () => {
    mockApi(routes(detail({ warnings: ['predecessor_not_done', 'date_conflict'] })));
    open();
    expect(await screen.findByText(/predecesora sin terminar/i)).toBeInTheDocument();
    expect(screen.getByText('Las fechas no respetan una dependencia')).toBeInTheDocument();
  });

  it('un ciclo muestra la cadena con los títulos de las tareas', async () => {
    mockApi({
      ...routes(detail()),
      'POST /api/tasks/t1/dependencies': apiError(409, 'dependency_cycle', { message: 'Esta dependencia crearía un ciclo: Diseño → Construcción → Diseño' }),
    });
    open();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Diseño' });
    await user.selectOptions(screen.getByLabelText('Añadir predecesora'), 't2');
    await user.click(screen.getByRole('button', { name: 'Añadir dependencia' }));
    expect(await screen.findByText(/Diseño → Construcción → Diseño/)).toBeInTheDocument();
  });

  it('avisa antes de eliminar una tarea de la que dependen otras', async () => {
    const api = mockApi({ ...routes(detail({ successorCount: 2 })), 'DELETE /api/tasks/t1': { ok: true } });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Eliminar tarea' }));
    const confirm = within(await screen.findByRole('dialog'));
    expect(confirm.getByText(/2 tarea\(s\) dependen de esta/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'DELETE /api/tasks/t1')).toBe(true));
    expect(await screen.findByRole('group', { name: 'Vista de tareas' })).toBeInTheDocument();
  });

  it('el colaborador asignado actualiza avance y no ve controles de PM', async () => {
    const api = mockApi({ ...routes(detail({ status: 'IN_PROGRESS' }), collaborator), 'PATCH /api/tasks/t1/progress': detail({ status: 'IN_PROGRESS', progress: 40 }) });
    open();
    const user = userEvent.setup();
    const slider = await screen.findByLabelText('Avance (%)');
    await user.clear(slider);
    await user.type(slider, '40');
    await user.click(screen.getByRole('button', { name: 'Guardar avance' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'PATCH /api/tasks/t1/progress');
      expect(call?.body).toEqual({ status: 'IN_PROGRESS', progress: 40 });
    });
    expect(screen.queryByRole('button', { name: 'Eliminar tarea' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Añadir predecesora')).not.toBeInTheDocument();
  });

  it('el colaborador no asignado solo lee', async () => {
    mockApi(routes(detail({ assignees: [{ id: 'otro', name: 'Otra' }] }), collaborator));
    open();
    await screen.findByText('Levantar el sitio');
    expect(screen.queryByRole('button', { name: 'Guardar avance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument();
  });

  it('publicar un comentario limpia el campo solo si se guardó', async () => {
    mockApi({ ...routes(detail()), 'POST /api/tasks/t1/comments': apiError(500, 'internal_error', { message: 'Falló' }) });
    open();
    const user = userEvent.setup();
    const box = await screen.findByLabelText('Nuevo comentario');
    await user.type(box, 'Hola');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));
    expect(await screen.findByText('Falló')).toBeInTheDocument();
    expect(box).toHaveValue('Hola');
  });
});

describe('página de detalle', () => {
  it('el formulario limita las fechas al proyecto y muestra el error por campo', async () => {
    mockApi({
      ...routes(detail()),
      'GET /api/projects/p1': { ...project, startDate: '2026-11-01', endDate: '2026-11-30' },
      'PATCH /api/tasks/t1': apiError(400, 'validation_error', { message: 'x', fields: { dueDate: 'La fecha debe estar dentro del proyecto (2026-11-01 a 2026-11-30)' } }),
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    const dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(dialog.getByLabelText('Fecha límite')).toHaveAttribute('max', '2026-11-30'));
    expect(dialog.getByLabelText('Fecha de inicio')).toHaveAttribute('min', '2026-11-01');
    await user.click(dialog.getByRole('button', { name: 'Guardar tarea' }));
    expect(await dialog.findByText(/dentro del proyecto/)).toBeInTheDocument();
  });

  it('tiene ruta de vuelta a las tareas', async () => {
    mockApi(routes(detail()));
    open();
    expect(await screen.findByRole('link', { name: /Tareas del proyecto/ })).toHaveAttribute('href', '/proyectos/p1/tareas');
  });

  it('una tarea inexistente muestra "no encontrado" con enlace a las tareas', async () => {
    mockApi({ ...routes(detail()), 'GET /api/tasks/t1': apiError(404, 'not_found', { message: 'Tarea no encontrada' }) });
    open();
    expect(await screen.findByText('Tarea no encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tareas del proyecto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('el formulario lista a los miembros activos, PM incluidos', async () => {
    mockApi({
      ...routes(detail()),
      'GET /api/projects/p1/members': [
        { userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '', active: true },
        { userId: 'pm2', name: 'Pedro', email: '', role: 'PM', projectRole: '', active: true },
        { userId: 'c9', name: 'Inés', email: '', role: 'COLLABORATOR', projectRole: '', active: false },
      ],
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByLabelText('Carlos')).toBeInTheDocument();
    expect(dialog.getByLabelText('Pedro')).toBeInTheDocument();
    expect(dialog.queryByLabelText('Inés')).not.toBeInTheDocument();
  });
});

describe('anexos', () => {
  const list = () => wrap(<AttachmentList scope={{ taskId: 't1' }} canUpload isPm currentUserId="pm" />);
  const file = (name: string, size: number, type = 'application/pdf') => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('rechaza en el cliente más de 25 MB, sin llamar a la API', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/tasks/t1/attachments': [] });
    list();
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Adjuntar archivo'), file('grande.pdf', 25 * 1024 * 1024 + 1));
    expect(await screen.findByText(/supera el límite de 25 MB/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  const target = { url: '/api/local-uploads/s1', method: 'PUT', headers: { 'content-type': 'application/pdf' } };
  const pending = {
    id: 'a1',
    projectId: 'p1',
    taskId: 't1',
    originalName: 'acta.pdf',
    mimeType: 'application/pdf',
    size: 10,
    uploadedBy: { id: 'pm', name: 'Paula' },
    createdAt: '2026-11-01T10:00:00.000Z',
  };

  it('sube en tres pasos: solicita, envía el archivo y confirma', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/tasks/t1/attachments': [],
      'POST /api/tasks/t1/attachments': { attachment: pending, upload: target },
      'PUT /api/local-uploads/s1': { ok: true },
      'POST /api/attachments/a1/complete': pending,
    });
    list();
    const user = userEvent.setup();
    const picked = file('acta.pdf', 10);
    await user.upload(await screen.findByLabelText('Adjuntar archivo'), picked);
    await waitFor(() => expect(api.calls.some((c) => c.key === 'POST /api/attachments/a1/complete')).toBe(true));
    const keys = api.calls.map((c) => c.key).filter((k) => !k.startsWith('GET'));
    expect(keys).toEqual(['POST /api/tasks/t1/attachments', 'PUT /api/local-uploads/s1', 'POST /api/attachments/a1/complete']);
    expect(api.calls.find((c) => c.key === 'POST /api/tasks/t1/attachments')!.body).toEqual({ filename: 'acta.pdf', mimeType: 'application/pdf', size: 10 });
    expect(api.calls.find((c) => c.key === 'PUT /api/local-uploads/s1')!.body).toBe(picked);
  });

  it('si falla el envío del archivo avisa y no confirma', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/tasks/t1/attachments': [],
      'POST /api/tasks/t1/attachments': { attachment: pending, upload: target },
      'PUT /api/local-uploads/s1': apiError(500, 'internal_error'),
    });
    list();
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Adjuntar archivo'), file('acta.pdf', 10));
    expect(await screen.findByText('No se pudo subir el archivo. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.endsWith('/complete'))).toBe(false);
  });

  it('muestra el error 415 del servidor', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/tasks/t1/attachments': [],
      'POST /api/tasks/t1/attachments': apiError(415, 'file_type_not_allowed', { message: 'Este tipo de archivo no está permitido' }),
    });
    list();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(await screen.findByLabelText('Adjuntar archivo'), file('virus.pdf', 10));
    expect(await screen.findByText('Este tipo de archivo no está permitido')).toBeInTheDocument();
  });

  it('enlaza la descarga y solo ofrece eliminar lo permitido', async () => {
    const item = (id: string, uploader: string) => ({
      id,
      projectId: 'p1',
      taskId: 't1',
      originalName: `${id}.pdf`,
      mimeType: 'application/pdf',
      size: 2048,
      uploadedBy: { id: uploader, name: uploader },
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    mockApi({ ...signedInAs(collaborator), 'GET /api/tasks/t1/attachments': [item('mio', 'c1'), item('ajeno', 'pm')] });
    wrap(<AttachmentList scope={{ taskId: 't1' }} canUpload={false} isPm={false} currentUserId="c1" />);
    expect(await screen.findByRole('link', { name: 'mio.pdf' })).toHaveAttribute('href', '/api/attachments/mio/download');
    expect(screen.getByRole('button', { name: 'Eliminar mio.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar ajeno.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adjuntar archivo')).not.toBeInTheDocument();
  });
});
