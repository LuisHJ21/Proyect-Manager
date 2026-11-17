import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HealthBadge } from '../src/components/ui';
import { apiError, collaborator, mockApi, observer, pmUser, renderApp, signedInAs } from './helpers';

const project = (id: string, name: string, status = 'EXECUTING') => ({ id, name, status, description: '', approach: 'AGILE', startDate: null, endDate: null, progress: 0, team: [] });

const nav = async () => within(await screen.findByRole('navigation', { name: 'Principal' }));

describe('navegación por rol', () => {
  it('PM ve Inicio, Mis tareas con contador, Calendario, Proyectos y Usuarios', async () => {
    const open = { id: 't', status: 'TODO' };
    const done = { id: 'd', status: 'DONE' };
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/me/tasks': [open, done] });
    renderApp('/proyectos');
    const links = await nav();
    for (const name of ['Inicio', 'Calendario', 'Proyectos', 'Usuarios']) {
      expect(links.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(await links.findByRole('link', { name: 'Mis tareas, 1 abiertas' })).toBeInTheDocument();
  });

  it('colaborador ve Mis tareas con contador, Calendario y Proyectos, sin Inicio ni Usuarios', async () => {
    const open = { id: 't', status: 'TODO' };
    const done = { id: 'd', status: 'DONE' };
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [open, done] });
    renderApp('/proyectos');
    const links = await nav();
    expect(await links.findByRole('link', { name: 'Mis tareas, 1 abiertas' })).toBeInTheDocument();
    expect(links.getByRole('link', { name: 'Calendario' })).toBeInTheDocument();
    expect(links.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
    expect(links.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('la barra lista solo proyectos activos, con enlace a su resumen', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [project('a', 'Activo'), project('c', 'Cerrado', 'CLOSED')] });
    renderApp('/usuarios');
    const links = await nav();
    expect(await links.findByRole('link', { name: 'Activo' })).toHaveAttribute('href', '/proyectos/a/resumen');
    expect(links.queryByRole('link', { name: 'Cerrado' })).not.toBeInTheDocument();
  });

  it('solo el PM tiene el botón de nuevo proyecto en la barra superior', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp('/proyectos');
    await nav();
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
  });

  it('dentro de un proyecto el menú general se compacta: mismos enlaces, sin proyectos activos ni nuevo proyecto', async () => {
    mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects': [project('p1', 'Portal')],
      'GET /api/me/tasks': [],
      'GET /api/projects/p1': project('p1', 'Portal'),
      'GET /api/projects/p1/members': [],
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
    });
    renderApp('/proyectos/p1/resumen');
    const links = await nav();
    for (const name of ['Inicio', 'Calendario', 'Proyectos', 'Usuarios']) {
      expect(links.getByRole('link', { name })).toBeInTheDocument();
    }
    await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(screen.queryByText('Proyectos activos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('el observador ve Proyectos, Calendario y Lecciones', async () => {
    mockApi({ ...signedInAs(observer), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp('/proyectos');
    const links = await nav();
    expect(links.getAllByRole('link').map((l) => l.textContent)).toEqual(expect.arrayContaining(['Proyectos', 'Calendario', 'Lecciones']));
    for (const name of [/Mis tareas/, 'Inicio', 'Usuarios']) expect(links.queryByRole('link', { name })).not.toBeInTheDocument();
  });

  it.each(['/', '/mis-tareas', '/panel'])('el observador que entra a %s llega a Proyectos', async (path) => {
    mockApi({ ...signedInAs(observer), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'Proyectos' })).toBeInTheDocument();
  });

  it('si la API responde que el perfil es de solo lectura, la sesión se actualiza al menú del observador', async () => {
    const api = mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    api.routes['GET /api/me/tasks'] = () => {
      api.routes['GET /api/auth/me'] = observer;
      return apiError(403, 'observer_read_only', { message: 'Tu perfil es de solo lectura' });
    };
    renderApp('/mis-tareas');
    expect(await screen.findByRole('heading', { name: 'Proyectos' })).toBeInTheDocument();
  });

  it('el PM entra a /mis-tareas', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp('/mis-tareas');
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('el colaborador en /panel vuelve a Mis tareas', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp('/panel');
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('un 403 por rol actualiza la sesión y lleva a la pantalla correcta', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    api.routes['GET /api/users'] = () => {
      api.routes['GET /api/auth/me'] = collaborator;
      return apiError(403, 'forbidden', { message: 'Sin permiso' });
    };
    renderApp('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('al cambiar de rol, la barra deja de mostrar proyectos a los que ya no tiene acceso', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [project('a', 'Ajeno')], 'GET /api/me/tasks': [] });
    api.routes['GET /api/users'] = () => {
      api.routes['GET /api/auth/me'] = collaborator;
      api.routes['GET /api/projects'] = [];
      return apiError(403, 'forbidden', { message: 'Sin permiso' });
    };
    renderApp('/usuarios');
    await screen.findByRole('heading', { name: 'Mis tareas' });
    const links = await nav();
    await waitFor(() => expect(links.queryByRole('link', { name: 'Ajeno' })).not.toBeInTheDocument());
  });

  it('cerrar sesión sigue disponible', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/auth/logout': { ok: true } });
    renderApp('/proyectos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});

describe('navegación móvil', () => {
  it('en móvil el PM ve Mis tareas en la barra inferior', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/me/tasks': [], 'GET /api/dashboard': apiError(500, 'internal_error') });
    renderApp('/proyectos');
    const links = await nav();
    expect(await links.findByRole('link', { name: 'Mis tareas, 0 abiertas' })).toBeInTheDocument();
    expect(links.getAllByRole('link')).toHaveLength(6);
  });

  it('ofrece cambiar la contraseña y cerrar sesión', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [], 'GET /api/me/tasks': [] });
    renderApp('/proyectos');
    expect(await screen.findByRole('link', { name: 'Cambiar mi contraseña' })).toHaveAttribute('href', '/cambiar-contrasena');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});

describe('HealthBadge', () => {
  it('muestra el texto del estado', () => {
    render(<HealthBadge health="AT_RISK" />);
    expect(screen.getByText('En riesgo')).toBeInTheDocument();
  });
});
