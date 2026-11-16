import { focusManager } from '@tanstack/react-query';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { greeting } from '../src/lib/greeting';
import { apiError, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const dashboard = {
  totals: { activeProjects: 4, atRiskProjects: 1, overdueTasks: 3, overdueProjects: 2, highRisks: 2, overBudgetProjects: 0 },
  projects: [{ id: 'p1', name: 'Nueva sucursal', progress: 23, endDate: '2026-11-30', health: 'AT_RISK', team: [{ id: 'c', name: 'Carlos Vega' }] }],
  attention: [
    { kind: 'task', id: 't1', title: 'Permisos de obra', projectId: 'p1', projectName: 'Nueva sucursal', dueDate: '2026-11-03' },
    { kind: 'risk', id: 'r1', title: 'Retraso del proveedor', projectId: 'p1', projectName: 'Nueva sucursal', score: 20 },
  ],
  workload: [{ userId: 'c', name: 'Carlos Vega', openTasks: 4, overdueTasks: 1 }],
  upcomingMilestones: [{ id: 'm1', name: 'Diseño aprobado', dueDate: '2026-11-18', projectId: 'p1', projectName: 'Nueva sucursal' }],
};
const empty = {
  totals: { activeProjects: 0, atRiskProjects: 0, overdueTasks: 0, overdueProjects: 0, highRisks: 0, overBudgetProjects: 0 },
  projects: [],
  attention: [],
  workload: [],
  upcomingMilestones: [],
};
const routes = (data: unknown) => ({ ...signedInAs(pmUser), 'GET /api/projects': [], 'GET /api/dashboard': data });

afterEach(() => focusManager.setFocused(undefined));

describe('greeting', () => {
  it('cambia según la hora, con el primer nombre', () => {
    expect(greeting(new Date(2026, 10, 7, 11, 59), 'Paula Ramos')).toBe('Buenos días, Paula');
    expect(greeting(new Date(2026, 10, 7, 12, 0), 'Paula Ramos')).toBe('Buenas tardes, Paula');
    expect(greeting(new Date(2026, 10, 7, 18, 59), 'Paula Ramos')).toBe('Buenas tardes, Paula');
    expect(greeting(new Date(2026, 10, 7, 19, 0), 'Paula Ramos')).toBe('Buenas noches, Paula');
  });
});

describe('panel general', () => {
  it('es el inicio del PM y muestra indicadores, salud, carga, atención e hitos', async () => {
    mockApi(routes(dashboard));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Paula/ })).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(await main.findByTestId('kpi-activeProjects')).toHaveTextContent('4');
    expect(main.getByTestId('kpi-activeProjects')).toHaveTextContent('1 en riesgo');
    expect(main.getByTestId('kpi-overdueTasks')).toHaveTextContent('en 2 proyectos');
    expect(main.getByTestId('kpi-highRisks')).toHaveTextContent('2');
    expect(main.getByTestId('kpi-overBudgetProjects')).toHaveTextContent('todos dentro del plan');
    expect(main.getByRole('link', { name: 'Nueva sucursal' })).toHaveAttribute('href', '/proyectos/p1/resumen');
    expect(main.getByText('En riesgo')).toBeInTheDocument();
    expect(main.getByText('23 %')).toBeInTheDocument();
    expect(main.getByText(/4 abiertas/)).toBeInTheDocument();
    expect(main.getByText(/1 vencida/)).toBeInTheDocument();
    expect(main.getByText('Diseño aprobado')).toBeInTheDocument();
  });

  it('una tarea de atención enlaza a su detalle y un riesgo a la pestaña de riesgos', async () => {
    mockApi(routes(dashboard));
    renderApp('/panel');
    expect(await screen.findByRole('link', { name: /Permisos de obra/ })).toHaveAttribute('href', '/proyectos/p1/tareas/t1');
    expect(screen.getByRole('link', { name: /Retraso del proveedor/ })).toHaveAttribute('href', '/proyectos/p1/riesgos');
    expect(screen.getByText(/Riesgo alto, puntaje 20/)).toBeInTheDocument();
  });

  it('sin proyectos activos invita a crear uno', async () => {
    mockApi(routes(empty));
    renderApp('/panel');
    expect(await screen.findByText(/Crea tu primer proyecto/)).toBeInTheDocument();
  });

  it('secciones vacías muestran su mensaje', async () => {
    mockApi(routes({ ...empty, totals: { ...empty.totals, activeProjects: 1 }, projects: dashboard.projects }));
    renderApp('/panel');
    expect(await screen.findByText('Nada requiere atención')).toBeInTheDocument();
    expect(screen.getByText('Sin hitos en los próximos 14 días')).toBeInTheDocument();
    expect(screen.getByText('Ningún colaborador tiene tareas abiertas')).toBeInTheDocument();
  });

  it('el fallo inicial muestra reintento', async () => {
    mockApi(routes(apiError(500, 'internal_error', { message: 'Falló' })));
    renderApp('/panel');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('al refrescar con error conserva los datos', async () => {
    const api = mockApi(routes(dashboard));
    renderApp('/panel');
    await screen.findByText('Diseño aprobado');
    api.routes['GET /api/dashboard'] = apiError(500, 'internal_error');
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByText('Diseño aprobado')).toBeInTheDocument();
  });
});

describe('incidentes en el panel', () => {
  it('requiere atención muestra incidentes', async () => {
    mockApi(
      routes({
        ...dashboard,
        attention: [{ kind: 'incident', id: 'i2', number: 2, title: 'Caída', projectId: 'p1', projectName: 'Portal', priority: 'MEDIUM', dueDate: '2026-11-01', overdue: true }],
      }),
    );
    renderApp('/');
    const link = await screen.findByRole('link', { name: /INC-2 · Caída/ });
    expect(link).toHaveAttribute('href', '/proyectos/p1/incidentes');
    expect(link).toHaveTextContent('Vencido');
  });
});

describe('entregables en el panel', () => {
  it('requiere atención muestra entregables vencidos', async () => {
    mockApi(
      routes({
        ...dashboard,
        attention: [{ kind: 'deliverable', id: 'd3', number: 3, title: 'Portal', projectId: 'p1', projectName: 'Portal', dueDate: '2026-11-01' }],
      }),
    );
    renderApp('/');
    const link = await screen.findByRole('link', { name: /ENT-3 · Portal está vencido/ });
    expect(link).toHaveAttribute('href', '/proyectos/p1/entregables');
  });
});

describe('cambios por aplicar en el panel', () => {
  it('requiere atención muestra los cambios aprobados sin aplicar', async () => {
    mockApi(routes({ ...dashboard, attention: [{ kind: 'change', id: 'cr1', number: 1, title: 'Agregar blog', projectId: 'p1', projectName: 'Portal' }] }));
    renderApp('/');
    const link = await screen.findByRole('link', { name: /CR-1 · Agregar blog/ });
    expect(link).toHaveAttribute('href', '/proyectos/p1/cambios');
    expect(link).toHaveTextContent('Aprobado sin aplicar · Portal');
  });
});

