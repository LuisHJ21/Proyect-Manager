import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, setRichText, signedInAs } from './helpers';

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
  it('al colaborador no le muestra Interesados, Riesgos ni Presupuesto', async () => {
    mockApi({ ...signedInAs(collaborator), ...summaryRoutes });
    renderApp('/proyectos/p1/resumen');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Acta' })).toBeInTheDocument();
    expect(within(tabs).getByRole('link', { name: 'Tareas' })).toBeInTheDocument();
    expect(within(tabs).getByRole('link', { name: 'Anexos' })).toBeInTheDocument();
    for (const name of ['Interesados', 'Riesgos', 'Presupuesto']) {
      expect(within(tabs).queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('al PM sí se las muestra', async () => {
    mockApi({ ...signedInAs(pmUser), ...summaryRoutes, 'GET /api/users': [] });
    renderApp('/proyectos/p1/resumen');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    for (const name of ['Interesados', 'Riesgos', 'Presupuesto']) {
      expect(within(tabs).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('el colaborador que abre /riesgos vuelve al resumen, sin pedir datos ocultos', async () => {
    const api = mockApi({ ...signedInAs(collaborator), ...summaryRoutes });
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
