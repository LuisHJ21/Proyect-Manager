import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, observer, renderApp, signedInAs } from './helpers';

const notice = (id: string, extra: object = {}) => ({
  id,
  kind: 'TASK_ASSIGNED',
  projectId: 'p1',
  projectName: 'Portal web',
  entityId: 't1',
  title: 'Diseño',
  actorName: '',
  readAt: null,
  createdAt: new Date().toISOString(),
  ...extra,
});

const base = { ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [] };

describe('campana de avisos', () => {
  it('muestra cuántos avisos hay sin leer', async () => {
    mockApi({ ...base, 'GET /api/notifications/unread-count': { count: 3 } });
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Avisos, 3 sin leer' })).toHaveTextContent('3');
  });

  it('desde 10 el globo muestra 9+', async () => {
    mockApi({ ...base, 'GET /api/notifications/unread-count': { count: 12 } });
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Avisos, 12 sin leer' })).toHaveTextContent('9+');
  });

  it('al abrirla lista los avisos; al pulsar uno lo marca y navega a la tarea', async () => {
    const api = mockApi({
      ...base,
      'GET /api/notifications/unread-count': { count: 1 },
      'GET /api/notifications': { items: [notice('n1'), notice('n2', { kind: 'TASK_DUE_SOON', title: 'Pruebas', readAt: new Date().toISOString() })], nextCursor: null },
      'POST /api/notifications/n1/read': { ok: true },
      'GET /api/tasks/t1': { id: 't1', title: 'Diseño' },
    });
    renderApp('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Avisos, 1 sin leer' }));
    expect(await screen.findByRole('button', { name: /La tarea «Pruebas» vence mañana/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Te asignaron la tarea «Diseño»/ }));
    await waitFor(() => expect(api.calls.map((c) => c.key)).toContain('POST /api/notifications/n1/read'));
    // Al navegar, la página del proyecto pide sus datos: la ruta cambió a /proyectos/p1/tareas/t1.
    await waitFor(() => expect(api.calls.map((c) => c.key)).toContain('GET /api/projects/p1'));
    expect(screen.queryByRole('dialog', { name: 'Avisos' })).not.toBeInTheDocument();
  });

  it('el panel se abre fuera de la barra lateral, para que el contenido no lo tape', async () => {
    mockApi({ ...base, 'GET /api/notifications/unread-count': { count: 0 }, 'GET /api/notifications': { items: [], nextCursor: null } });
    renderApp('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Avisos' }));
    const panel = await screen.findByRole('dialog', { name: 'Avisos' });
    expect(panel.closest('aside')).toBeNull();
    expect(panel.parentElement).toBe(document.body);
  });

  it('marcar todo como leído', async () => {
    const api = mockApi({
      ...base,
      'GET /api/notifications/unread-count': { count: 1 },
      'GET /api/notifications': { items: [notice('n1')], nextCursor: null },
      'POST /api/notifications/read-all': { ok: true },
    });
    renderApp('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Avisos, 1 sin leer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todo como leído' }));
    await waitFor(() => expect(api.calls.map((c) => c.key)).toContain('POST /api/notifications/read-all'));
  });

  it('sin avisos dice que no hay', async () => {
    mockApi({ ...base, 'GET /api/notifications/unread-count': { count: 0 }, 'GET /api/notifications': { items: [], nextCursor: null } });
    renderApp('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Avisos' }));
    expect(await screen.findByText('No tienes avisos')).toBeInTheDocument();
  });

  it('el observador no ve la campana', async () => {
    mockApi({ ...signedInAs(observer), 'GET /api/projects': [], 'GET /api/notifications/unread-count': { count: 0 } });
    renderApp('/proyectos');
    await screen.findByRole('navigation', { name: 'Principal' });
    expect(screen.queryByRole('button', { name: /^Avisos/ })).not.toBeInTheDocument();
  });
});
