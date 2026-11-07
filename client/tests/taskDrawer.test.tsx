import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Task, TaskDetail } from '../src/api/types';
import { TaskDrawer } from '../src/components/tasks/TaskDrawer';
import { AttachmentList } from '../src/components/attachments/AttachmentList';
import { apiError, collaborator, mockApi, pmUser, signedInAs, wrap } from './helpers';

const detail = (over: Partial<TaskDetail> = {}): TaskDetail => ({
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
  assignees: [{ id: 'c1', name: 'Carlos' }],
  predecessorIds: [],
  successorCount: 0,
  waitingOn: [],
  warnings: [],
  comments: [],
  ...over,
});
const other: Task = { ...detail({ id: 't2', title: 'Diseño' }) };

const routes = (task: TaskDetail, user: object = pmUser) => ({
  ...signedInAs(user),
  'GET /api/tasks/t1': task,
  'GET /api/tasks/t1/attachments': [],
  'GET /api/projects/p1/tasks': [task, other],
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/milestones': [],
});

const open = (onClose = vi.fn()) => wrap(<TaskDrawer projectId="p1" taskId="t1" onClose={onClose} />);

describe('detalle de tarea', () => {
  it('muestra las advertencias de dependencias', async () => {
    mockApi(routes(detail({ warnings: ['predecessor_not_done', 'starts_before_predecessor_due'] })));
    open();
    expect(await screen.findByText(/predecesora sin terminar/i)).toBeInTheDocument();
    expect(screen.getByText(/empieza antes de la fecha límite/i)).toBeInTheDocument();
  });

  it('un ciclo muestra la cadena con los títulos de las tareas', async () => {
    mockApi({
      ...routes(detail()),
      'POST /api/tasks/t1/dependencies': apiError(409, 'dependency_cycle', { message: 'Esta dependencia crearía un ciclo: Diseño → Construcción → Diseño' }),
    });
    open();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Añadir predecesora'), 't2');
    await user.click(screen.getByRole('button', { name: 'Añadir dependencia' }));
    expect(await screen.findByText(/Diseño → Construcción → Diseño/)).toBeInTheDocument();
  });

  it('avisa antes de eliminar una tarea de la que dependen otras', async () => {
    const onClose = vi.fn();
    const api = mockApi({ ...routes(detail({ successorCount: 2 })), 'DELETE /api/tasks/t1': { ok: true } });
    open(onClose);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Eliminar tarea' }));
    const dialogs = await screen.findAllByRole('dialog');
    const confirm = within(dialogs[dialogs.length - 1]!);
    expect(confirm.getByText(/2 tarea\(s\) dependen de esta/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'DELETE /api/tasks/t1')).toBe(true));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
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
