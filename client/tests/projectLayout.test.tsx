import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, collaborator, mockApi, observer, pmUser, renderApp, setRichText, signedInAs } from './helpers';

const project = {
  id: 'p1',
  name: 'Portal',
  description: 'Sitio nuevo',
  status: 'EXECUTING',
  approach: 'AGILE',
  startDate: null,
  endDate: null,
  plannedBudgetCents: 100000,
  currency: 'USD',
};
const summaryRoutes = {
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/indicators': { progress: 50, overdueTasks: 2, blockedTasks: 1, upcomingMilestones: [] },
  'GET /api/projects/p1/objectives': [],
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/members': [],
};

describe('pestañas del proyecto', () => {
  afterEach(() => vi.unstubAllGlobals());
  const tabNames = async () =>
    within(await screen.findByRole('navigation', { name: 'Secciones del proyecto' }))
      .getAllByRole('link')
      .map((link) => link.querySelector('[data-nav-label]')?.textContent);

  it('el colaborador ve sus pestañas, entregables y riesgos incluidos', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes });
    renderApp('/proyectos/p1/resumen');
    expect(await tabNames()).toEqual(['Resumen', 'EDT', 'Cronograma', 'Hitos', 'Acta', 'Requisitos', 'Tareas', 'Entregables', 'Incidentes', 'Riesgos', 'Control de cambios', 'Reuniones', 'Lecciones', 'Anexos']);
  });

  it('el observador ve solo las pestañas de lectura de su perfil', async () => {
    mockApi({ ...signedInAs(observer), ...summaryRoutes });
    renderApp('/proyectos/p1/resumen');
    expect(await tabNames()).toEqual(['Resumen', 'EDT', 'Cronograma', 'Hitos', 'Acta', 'Requisitos', 'Tareas', 'Entregables', 'Informes', 'Lecciones', 'Anexos']);
  });

  it('al PM sí se las muestra', async () => {
    mockApi({ ...signedInAs(pmUser), ...summaryRoutes, 'GET /api/users': [] });
    renderApp('/proyectos/p1/resumen');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    for (const name of ['Interesados', 'Riesgos', 'Presupuesto']) {
      expect(within(tabs).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('el menú agrupa las secciones y marca las tareas vencidas sin cambiar el nombre del enlace', async () => {
    mockApi({ ...signedInAs(pmUser), ...summaryRoutes, 'GET /api/users': [] });
    renderApp('/proyectos/p1/resumen');
    const nav = within(await screen.findByRole('navigation', { name: 'Secciones del proyecto' }));
    for (const group of ['Planificación', 'Ejecución', 'Control', 'Personas', 'Cierre']) {
      expect(nav.getByText(group, { selector: 'p' })).toBeInTheDocument();
    }
    const tasks = nav.getByRole('link', { name: 'Tareas' });
    await waitFor(() => expect(tasks).toHaveTextContent('2'));
    expect(nav.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'EDT' })).toHaveAttribute('href', '/proyectos/p1/edt');
  });

  it('en móvil permite abrir la EDT desde un selector de secciones', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    mockApi({ ...signedInAs(pmUser), ...summaryRoutes, 'GET /api/projects/p1/tasks': [] });
    renderApp('/proyectos/p1/resumen');
    const selector = await screen.findByRole('combobox', { name: 'Sección del proyecto' });
    await userEvent.setup().selectOptions(selector, 'edt');
    expect(await screen.findByRole('heading', { name: 'Estructura de desglose del trabajo' })).toBeInTheDocument();
    expect(selector).toHaveValue('edt');
  });

  it('el observador que abre /riesgos vuelve al resumen, sin pedir datos ocultos', async () => {
    const api = mockApi({ ...signedInAs(observer), ...summaryRoutes });
    renderApp('/proyectos/p1/riesgos');
    expect(await screen.findByTestId('indicator-progress')).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.includes('/risks'))).toBe(false);
  });

  it('un proyecto ajeno muestra "no encontrado"', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects/p1': apiError(404, 'not_found', { message: 'Proyecto no encontrado' }) });
    renderApp('/proyectos/p1/resumen');
    expect(await screen.findByText('Proyecto no encontrado')).toBeInTheDocument();
  });

  it('el resumen muestra los indicadores', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes });
    renderApp('/proyectos/p1/resumen');
    expect(await screen.findByTestId('indicator-progress')).toHaveTextContent('50 %');
    expect(screen.queryByText('Presupuesto gastado')).not.toBeInTheDocument();
    const shortcuts = within(screen.getByRole('region', { name: 'Accesos del proyecto' }));
    expect(shortcuts.getByRole('link', { name: /EDT/ })).toHaveAttribute('href', '/proyectos/p1/edt');
    expect(shortcuts.getByRole('link', { name: /Cronograma/ })).toHaveAttribute('href', '/proyectos/p1/cronograma');
  });

  it('el resumen reparte los bloques en una columna principal y una lateral', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes });
    renderApp('/proyectos/p1/resumen');
    const main = within(await screen.findByRole('region', { name: 'Columna principal' }));
    const side = within(screen.getByRole('region', { name: 'Columna lateral' }));
    expect(main.getByRole('heading', { name: 'Hitos' })).toBeInTheDocument();
    expect(main.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
    expect(side.getByRole('heading', { name: 'Acerca del proyecto' })).toBeInTheDocument();
    expect(side.getByText('Sitio nuevo')).toBeInTheDocument();
    expect(side.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
  });

  it('el PM gestiona roles en un menú y los elige al añadir una persona', async () => {
    const api = mockApi({ ...signedInAs(pmUser), ...summaryRoutes,
      'GET /api/users': [{ id: 'u2', name: 'Ana', active: true, role: 'COLLABORATOR' }],
      'GET /api/projects/p1/roles': [{ id: 'r1', name: 'Diseño' }],
      'POST /api/projects/p1/members': { userId: 'u2' },
    });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gestionar roles' }));
    expect(screen.getByRole('dialog', { name: 'Gestionar roles del proyecto' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.selectOptions(screen.getByLabelText('Añadir persona'), 'u2');
    await user.selectOptions(screen.getByLabelText('Rol en el proyecto'), 'Diseño');
    await user.click(screen.getByRole('button', { name: 'Añadir al equipo' }));
    await waitFor(() => expect(api.calls.find((call) => call.key === 'POST /api/projects/p1/members')?.body).toEqual({ userId: 'u2', projectRole: 'Diseño' }));
  });

  it('la descripción del proyecto se ve con formato', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes, 'GET /api/projects/p1': { ...project, description: '<p><em>Sitio</em> nuevo</p>' } });
    renderApp('/proyectos/p1/resumen');
    expect((await screen.findByText('Sitio')).tagName).toBe('EM');
  });

  it('un proyecto sin descripción lo indica', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes, 'GET /api/projects/p1': { ...project, description: '' } });
    renderApp('/proyectos/p1/resumen');
    expect(await screen.findByText('Sin descripción.')).toBeInTheDocument();
  });
});

describe('lista de proyectos', () => {
  it('el colaborador no ve el botón para crear', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [{ ...project, progress: 40 }] });
    renderApp('/proyectos');
    expect(await within(await screen.findByRole('main')).findByRole('link', { name: 'Portal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
  });

  it('crear un proyecto convierte el presupuesto a centavos', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/projects': project });
    renderApp('/proyectos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portal');
    await user.type(screen.getByLabelText('Presupuesto planificado'), '1.234,50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'POST /api/projects');
      expect((call?.body as { plannedBudgetCents: number }).plannedBudgetCents).toBe(123450);
    });
  });

  it('la descripción se escribe con formato', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/projects': project });
    renderApp('/proyectos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portal');
    await setRichText('Descripción', '<p>Hola</p>');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'POST /api/projects');
      expect((call?.body as { description: string }).description).toBe('<p>Hola</p>');
    });
  });

  it('crear un proyecto envía las reservas', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/projects': project });
    renderApp('/proyectos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portal');
    await user.type(screen.getByLabelText('Reserva de contingencia'), '50');
    await user.type(screen.getByLabelText('Reserva de gestión'), '20');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects')?.body).toMatchObject({ contingencyReserveCents: 5000, managementReserveCents: 2000 }),
    );
  });

  it('un presupuesto inválido no se envía', async () => {
    const api = mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [], 'POST /api/projects': project });
    renderApp('/proyectos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portal');
    await user.type(screen.getByLabelText('Presupuesto planificado'), 'mil');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Monto inválido/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.key === 'POST /api/projects')).toBe(false);
  });
});

describe('eliminar proyecto', () => {
  it('exige escribir su nombre', async () => {
    const api = mockApi({ ...signedInAs(pmUser), ...summaryRoutes, 'GET /api/users': [], 'DELETE /api/projects/p1': { ok: true }, 'GET /api/projects': [] });
    renderApp('/proyectos/p1/resumen');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Eliminar proyecto' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar definitivamente' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Nombre del proyecto'), 'Portal');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'DELETE /api/projects/p1');
      expect(call?.body).toEqual({ confirmName: 'Portal' });
    });
  });
});
