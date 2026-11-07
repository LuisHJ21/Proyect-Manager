import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const paula = { ...pmUser, projects: [], openTasks: 0, overdueTasks: 0 };
const otherPm = { ...pmUser, id: 'pm2', name: 'Pedro', email: 'pedro@x.com', projects: [], openTasks: 0, overdueTasks: 0 };
const carlos = {
  ...collaborator,
  name: 'Carlos Vega',
  projects: [
    { id: 'p1', name: 'Portal', projectRole: 'Diseño' },
    { id: 'p2', name: 'Migración ERP', projectRole: '' },
    { id: 'p3', name: 'Sucursal', projectRole: '' },
  ],
  openTasks: 4,
  overdueTasks: 1,
};
const inactiva = { ...collaborator, id: 'c2', name: 'Inés Mora', email: 'ines@x.com', active: false, projects: [], openTasks: 0, overdueTasks: 0 };
const base = { ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/users': [paula, carlos, inactiva] };

const open = async (routes: object = base) => {
  const api = mockApi(routes as Record<string, unknown>);
  renderApp('/usuarios');
  const main = within(await screen.findByRole('main'));
  await main.findByText('Carlos Vega');
  return { api, main, user: userEvent.setup() };
};

describe('lista de usuarios', () => {
  it('Activos es el filtro inicial y el contador lo refleja', async () => {
    const { main } = await open();
    expect(main.queryByText('Inés Mora')).not.toBeInTheDocument();
    expect(main.getByText('2 de 3 usuarios')).toBeInTheDocument();
  });

  it('búsqueda por nombre o correo sin acentos, y filtros de rol y estado', async () => {
    const { main, user } = await open();
    await user.selectOptions(main.getByLabelText('Estado'), 'ALL');
    await user.type(main.getByLabelText('Buscar usuarios'), 'INES');
    expect(main.getByText('Inés Mora')).toBeInTheDocument();
    expect(main.queryByText('Carlos Vega')).not.toBeInTheDocument();
    await user.clear(main.getByLabelText('Buscar usuarios'));
    await user.type(main.getByLabelText('Buscar usuarios'), 'c@x.com');
    expect(main.getByText('Carlos Vega')).toBeInTheDocument();
    await user.clear(main.getByLabelText('Buscar usuarios'));
    await user.selectOptions(main.getByLabelText('Rol'), 'PM');
    expect(main.getByText('Paula')).toBeInTheDocument();
    expect(main.queryByText('Carlos Vega')).not.toBeInTheDocument();
  });

  it('muestra hasta 2 proyectos y "y N más"; un PM sin membresías ve todos', async () => {
    const { main } = await open();
    expect(main.getByText('Portal, Migración ERP y 1 más')).toBeInTheDocument();
    expect(main.getByText('Ve todos los proyectos')).toBeInTheDocument();
  });

  it('las tareas de un PM muestran "No aplica" y las de un colaborador sus cifras', async () => {
    const { main } = await open();
    expect(main.getByText('No aplica')).toBeInTheDocument();
    expect(main.getByText('4 abiertas')).toBeInTheDocument();
    expect(main.getByText('1 vencida')).toBeInTheDocument();
  });

  it('sin resultados ofrece limpiar los filtros', async () => {
    const { main, user } = await open();
    await user.type(main.getByLabelText('Buscar usuarios'), 'zzz');
    await user.click(main.getByRole('button', { name: 'Limpiar filtros' }));
    expect(main.getByText('Carlos Vega')).toBeInTheDocument();
  });

  it('crear un usuario conserva lo escrito y marca el correo repetido', async () => {
    const { main, user } = await open({
      ...base,
      'POST /api/users': apiError(409, 'email_taken', { message: 'Ya existe', fields: { email: 'Ya existe una cuenta con este correo' } }),
    });
    await user.click(main.getByRole('button', { name: 'Nuevo usuario' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Nombre'), 'Bea');
    await user.type(dialog.getByLabelText('Correo'), 'bea@x.com');
    await user.type(dialog.getByLabelText('Contraseña temporal'), 'temporal-12345');
    await user.click(dialog.getByRole('button', { name: 'Crear usuario' }));
    expect(await dialog.findByText('Ya existe una cuenta con este correo')).toBeInTheDocument();
    expect(dialog.getByLabelText('Nombre')).toHaveValue('Bea');
  });
});

describe('editar', () => {
  it('envía nombre y rol y no ofrece el correo', async () => {
    const { api, main, user } = await open({ ...base, 'PATCH /api/users/c1': carlos });
    await user.click(main.getByRole('button', { name: 'Editar a Carlos Vega' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByLabelText('Correo')).not.toBeInTheDocument();
    await user.clear(dialog.getByLabelText('Nombre'));
    await user.type(dialog.getByLabelText('Nombre'), 'Carlos M.');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/users/c1')?.body).toEqual({ name: 'Carlos M.', role: 'COLLABORATOR' }));
  });

  it('cambiar un colaborador a PM avisa cuántas tareas abiertas perderá', async () => {
    const { api, main, user } = await open({ ...base, 'PATCH /api/users/c1': { ...carlos, role: 'PM' } });
    await user.click(main.getByRole('button', { name: 'Editar a Carlos Vega' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Rol'), 'PM');
    expect(dialog.getByRole('status')).toHaveTextContent(/perderá sus 4 tareas abiertas/i);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(api.calls.some((c) => c.key === 'PATCH /api/users/c1')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === 'PATCH /api/users/c1')).toBe(true));
  });

  it('quitarse el rol de PM avisa y, al guardar, actualiza la sesión y sale de Usuarios', async () => {
    const pedro = { ...otherPm };
    const api = mockApi({ ...base, 'GET /api/users': [paula, pedro, carlos], 'GET /api/me/tasks': [] });
    api.routes['PATCH /api/users/pm'] = () => {
      api.routes['GET /api/auth/me'] = { ...pmUser, role: 'COLLABORATOR' };
      return { ...pmUser, role: 'COLLABORATOR' };
    };
    renderApp('/usuarios');
    const main = within(await screen.findByRole('main'));
    const user = userEvent.setup();
    await user.click(await main.findByRole('button', { name: 'Editar a Paula' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Rol'), 'COLLABORATOR');
    expect(dialog.getByRole('status')).toHaveTextContent(/perderás el acceso/i);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });

  it('last_pm se muestra como mensaje claro', async () => {
    const { main, user } = await open({
      ...base,
      'PATCH /api/users/pm': apiError(409, 'last_pm', { message: 'Debe quedar al menos un Project Manager activo' }),
    });
    await user.click(main.getByRole('button', { name: 'Editar a Paula' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Rol'), 'COLLABORATOR');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Debe quedar al menos un Project Manager activo')).toBeInTheDocument();
  });
});

describe('menú Más', () => {
  it('desactivar a otra persona pide confirmar y llama a la API', async () => {
    const { api, main, user } = await open({ ...base, 'PATCH /api/users/c1': { ...carlos, active: false } });
    await user.click(main.getByRole('button', { name: 'Más acciones de Carlos Vega' }));
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/users/c1')?.body).toEqual({ active: false }));
  });

  it('desactivarse a uno mismo avisa que cerrará su sesión', async () => {
    const { main, user } = await open();
    await user.click(main.getByRole('button', { name: 'Más acciones de Paula' }));
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }));
    expect(await screen.findByText(/cerrará tu sesión/i)).toBeInTheDocument();
  });

  it('restablecer la contraseña envía la temporal', async () => {
    const { api, main, user } = await open({ ...base, 'POST /api/users/c1/reset-password': carlos });
    await user.click(main.getByRole('button', { name: 'Más acciones de Carlos Vega' }));
    await user.click(screen.getByRole('menuitem', { name: 'Restablecer contraseña' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Contraseña temporal'), 'temporal-nueva-1');
    await user.click(dialog.getByRole('button', { name: 'Restablecer' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/users/c1/reset-password')?.body).toEqual({ temporaryPassword: 'temporal-nueva-1' }));
  });

  it('el menú no queda recortado por la tabla', async () => {
    const { main, user } = await open();
    await user.click(main.getByRole('button', { name: 'Más acciones de Carlos Vega' }));
    expect(screen.getByRole('menu')).toHaveClass('fixed');
  });

  it('la tabla mantiene su encabezado a la vista', async () => {
    const { main } = await open();
    const wrapper = main.getByRole('table').parentElement!;
    expect(wrapper).toHaveClass('overflow-auto');
    expect(wrapper.className).toMatch(/max-h-/);
  });

  it('Escape cierra el menú', async () => {
    const { main, user } = await open();
    await user.click(main.getByRole('button', { name: 'Más acciones de Carlos Vega' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('detalle de la persona', () => {
  it('al abrir la fila muestra proyectos y tareas abiertas, con enlaces', async () => {
    const { main, user } = await open({
      ...base,
      'GET /api/users/c1/tasks': [{ id: 't1', title: 'Permisos de obra', status: 'TODO', dueDate: '2026-11-03', projectId: 'p1', projectName: 'Portal' }],
    });
    await user.click(main.getByRole('button', { name: 'Ver detalle de Carlos Vega' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('link', { name: 'Portal' })).toHaveAttribute('href', '/proyectos/p1/resumen');
    expect(dialog.getByText(/Diseño/)).toBeInTheDocument();
    expect(await dialog.findByRole('link', { name: /Permisos de obra/ })).toHaveAttribute('href', '/proyectos/p1/tareas/t1');
  });
});
