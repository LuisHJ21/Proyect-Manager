import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const noSession = { 'GET /api/setup/status': { needsSetup: false }, 'GET /api/auth/me': apiError(401, 'unauthenticated') };

describe('acceso', () => {
  it('sin sesión lleva a iniciar sesión', async () => {
    mockApi(noSession);
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con needsSetup muestra la configuración inicial', async () => {
    mockApi({ 'GET /api/setup/status': { needsSetup: true }, 'GET /api/auth/me': apiError(401, 'unauthenticated') });
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('con mustChangePassword exige cambiar la contraseña', async () => {
    mockApi(signedInAs({ ...collaborator, mustChangePassword: true }));
    renderApp('/mis-tareas');
    expect(await screen.findByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });

  it('muestra el error de credenciales al iniciar sesión', async () => {
    mockApi({ ...noSession, 'POST /api/auth/login': apiError(401, 'invalid_credentials', { message: 'Correo o contraseña incorrectos' }) });
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correo'), 'a@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-incorrecta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveValue('a@x.com');
  });

  it('el servidor caído muestra un aviso con reintento', async () => {
    mockApi({ 'GET /api/setup/status': apiError(500, 'internal_error'), 'GET /api/auth/me': apiError(500, 'internal_error') });
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el colaborador no ve Usuarios y entra a /mis-tareas', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/me/tasks': [] });
    renderApp('/');
    await screen.findByRole('link', { name: /^Mis tareas/ });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('el colaborador que abre /usuarios no ve la pantalla', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/me/tasks': [] });
    renderApp('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });
});

describe('entrar y salir', () => {
  it('tras la configuración inicial entra a la aplicación', async () => {
    mockApi({
      'GET /api/setup/status': { needsSetup: true },
      'GET /api/auth/me': apiError(401, 'unauthenticated'),
      'POST /api/setup': pmUser,
      'GET /api/projects': [],
    });
    renderApp('/');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre'), 'Paula');
    await user.type(screen.getByLabelText('Correo'), 'p@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('heading', { name: /Paula/ })).toBeInTheDocument();
  });

  it('si el servidor pide código, la configuración inicial lo envía', async () => {
    const api = mockApi({
      'GET /api/setup/status': { needsSetup: true, requiresToken: true },
      'GET /api/auth/me': apiError(401, 'unauthenticated'),
      'POST /api/setup': apiError(403, 'setup_token_invalid', { message: 'El código de configuración no es correcto' }),
    });
    renderApp('/');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Código de configuración'), 'abc');
    await user.type(screen.getByLabelText('Nombre'), 'Paula');
    await user.type(screen.getByLabelText('Correo'), 'p@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('El código de configuración no es correcto')).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === 'POST /api/setup')!.body).toEqual({
      name: 'Paula',
      email: 'p@x.com',
      password: 'contraseña-larga',
      token: 'abc',
    });
  });

  it('sin código requerido no muestra el campo ni lo envía', async () => {
    const api = mockApi({
      'GET /api/setup/status': { needsSetup: true, requiresToken: false },
      'GET /api/auth/me': apiError(401, 'unauthenticated'),
      'POST /api/setup': pmUser,
      'GET /api/projects': [],
    });
    renderApp('/');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre'), 'Paula');
    expect(screen.queryByLabelText('Código de configuración')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo'), 'p@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'POST /api/setup')).toBe(true));
    expect(api.calls.find((c) => c.key === 'POST /api/setup')!.body).not.toHaveProperty('token');
  });

  it('tras iniciar sesión entra a la aplicación', async () => {
    mockApi({ ...noSession, 'POST /api/auth/login': collaborator, 'GET /api/me/tasks': [] });
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correo'), 'c@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('cerrar sesión lleva a iniciar sesión y olvida los datos anteriores', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/auth/logout': { ok: true } });
    renderApp('/proyectos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('al vencer la sesión lleva a iniciar sesión', async () => {
    mockApi({ ...signedInAs(pmUser), 'GET /api/projects': apiError(401, 'unauthenticated') });
    renderApp('/proyectos');
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('tras cambiar la contraseña temporal entra a la aplicación', async () => {
    mockApi({
      ...signedInAs({ ...collaborator, mustChangePassword: true }),
      'POST /api/auth/change-password': collaborator,
      'GET /api/me/tasks': [],
    });
    renderApp('/');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Contraseña actual'), 'temporal-12345');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nueva-clave-larga');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });
});
