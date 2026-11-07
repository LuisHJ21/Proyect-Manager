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
    await screen.findByRole('link', { name: 'Mis tareas' });
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('el colaborador que abre /usuarios no ve la pantalla', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/me/tasks': [] });
    renderApp('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });
});

describe('usuarios', () => {
  const routes = {
    ...signedInAs(pmUser),
    'GET /api/users': [pmUser],
    'POST /api/users': apiError(409, 'email_taken', { message: 'Ya existe', fields: { email: 'Ya existe una cuenta con este correo' } }),
  };

  it('conserva lo escrito y marca fields.email ante email_taken', async () => {
    mockApi(routes);
    renderApp('/usuarios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await user.type(screen.getByLabelText('Nombre'), 'Bea');
    await user.type(screen.getByLabelText('Correo'), 'bea@x.com');
    await user.type(screen.getByLabelText('Contraseña temporal'), 'temporal-12345');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Ya existe una cuenta con este correo')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Bea');
    expect(screen.getByLabelText('Correo')).toHaveValue('bea@x.com');
  });

  it('desactivar llama a la API', async () => {
    const other = { ...collaborator };
    const api = mockApi({ ...routes, 'GET /api/users': [pmUser, other], 'PATCH /api/users/c1': { ...other, active: false } });
    renderApp('/usuarios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Desactivar a Carlos' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'PATCH /api/users/c1')).toBe(true));
  });
});
