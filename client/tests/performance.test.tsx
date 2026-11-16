import { formatMoney } from '@pm/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 500000, currency: 'USD' };
const money = (cents: number) => formatMoney(cents, 'USD').replace(/\s+/g, ' ');
const empty = { baseline: null, history: [], metrics: null, tasks: [], outsideBaseline: 0, outsideBaselineCostCents: 0, series: [] };
const v1 = {
  version: 1,
  reason: '',
  bacCents: 400000,
  startDate: null,
  endDate: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  createdBy: { id: 'pm', name: 'Paula' },
  changeRequest: null,
};
const v2 = { ...v1, version: 2, reason: 'Cambio aprobado', createdAt: '2026-11-06T10:00:00.000Z', changeRequest: { id: 'cr1', number: 1, title: 'Agregar blog' } };
const withBaseline = {
  baseline: v2,
  history: [v2, v1],
  metrics: {
    pvCents: 50000,
    evCents: 40000,
    acCents: 50000,
    bacCents: 400000,
    cpi: 0.8,
    spi: null,
    cvCents: -10000,
    svCents: -10000,
    eacCents: 500000,
    eacMethod: 'CPI',
    etcCents: 450000,
    vacCents: -100000,
    percentComplete: 10,
    reserveCents: 100000,
  },
  tasks: [
    { taskId: 't1', title: 'Diseño', baselineCostCents: 100000, progress: 40, evCents: 40000, linkedCostCents: 50000, finishVarianceDays: 3, state: 'LATE' },
    { taskId: 't2', title: 'Construcción', baselineCostCents: 300000, progress: null, evCents: null, linkedCostCents: 0, finishVarianceDays: null, state: 'DELETED' },
    { taskId: 't3', title: 'Blog', baselineCostCents: null, progress: 0, evCents: null, linkedCostCents: 0, finishVarianceDays: null, state: 'OUTSIDE' },
  ],
  outsideBaseline: 1,
  outsideBaselineCostCents: 0,
  series: [
    { date: '2026-11-01', pvCents: 10000, evCents: null, acCents: null },
    { date: '2026-11-04', pvCents: 40000, evCents: 30000, acCents: 45000 },
    { date: '2026-11-05', pvCents: 50000, evCents: 40000, acCents: 50000 },
    { date: '2026-11-10', pvCents: 100000, evCents: null, acCents: null },
  ],
};
const costedTasks = [
  { id: 't1', title: 'Diseño', plannedCostCents: 100000 },
  { id: 't2', title: 'Construcción', plannedCostCents: 300000 },
  { id: 't4', title: 'Sin costo', plannedCostCents: 0 },
];
const base = {
  ...signedInAs(pmUser),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/tasks': costedTasks,
  'GET /api/projects/p1/change-requests': [
    { id: 'cr1', number: 1, title: 'Agregar blog', status: 'APPROVED' },
    { id: 'cr2', number: 2, title: 'Pendiente', status: 'PENDING' },
  ],
};
const open = () => renderApp('/proyectos/p1/desempeno');

describe('pestaña Desempeño', () => {
  it('con CPI 0 el EAC se marca como estimación', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': { ...withBaseline, metrics: { ...withBaseline.metrics, cpi: 0, eacMethod: 'ATYPICAL' } } });
    open();
    const cards = await screen.findByRole('region', { name: 'Indicadores de valor ganado' });
    const eac = within(cards).getByText(/EAC/).closest('div[data-card]') as HTMLElement;
    expect(eac).toHaveTextContent('Estimación: aún no hay avance que permita proyectar el costo');
  });

  it('muestra aparte el gasto que no está ligado a la línea base', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': { ...withBaseline, outsideBaselineCostCents: 2500 } });
    open();
    expect(await screen.findByText(`De este costo real, ${money(2500)} no está ligado a tareas de la línea base`)).toBeInTheDocument();
  });

  it('sin gasto fuera de la línea base no muestra esa línea', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline });
    open();
    await screen.findByRole('region', { name: 'Indicadores de valor ganado' });
    expect(screen.queryByText(/no está ligado a tareas de la línea base/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimación: aún no hay avance/)).not.toBeInTheDocument();
  });

  it('sin línea base invita a fijarla', async () => {
    const api = mockApi({ ...base, 'GET /api/projects/p1/performance': empty, 'POST /api/projects/p1/baselines': v1 });
    open();
    expect(await screen.findByText(/2 tareas con costo planeado/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fijar línea base' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/baselines')?.body).toEqual({}));
  });

  it('si faltan fechas, lista las tareas con enlace', async () => {
    mockApi({
      ...base,
      'GET /api/projects/p1/performance': empty,
      'POST /api/projects/p1/baselines': apiError(400, 'baseline_missing_dates', {
        message: 'Todas las tareas con costo necesitan fecha de inicio y de fin',
        details: { tasks: [{ id: 't1', title: 'Diseño' }] },
      }),
    });
    open();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Fijar línea base' }));
    expect(await screen.findByText('Todas las tareas con costo necesitan fecha de inicio y de fin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diseño' })).toHaveAttribute('href', '/proyectos/p1/tareas/t1');
  });

  it('con línea base muestra tarjetas con color y texto', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline });
    open();
    const cards = await screen.findByRole('region', { name: 'Indicadores de valor ganado' });
    const card = (name: RegExp) => within(cards).getByText(name).closest('div[data-card]') as HTMLElement;
    expect(card(/CPI/)).toHaveTextContent('0,80');
    expect(card(/CPI/)).toHaveTextContent('Sobre el costo');
    expect(card(/SPI/)).toHaveTextContent('—');
    expect(card(/EAC/)).toHaveTextContent(money(500000));
    expect(card(/VAC/)).toHaveTextContent(money(-100000));
    expect(card(/completado/)).toHaveTextContent('10 %');
    expect(card(/Reserva/)).toHaveTextContent(money(100000));
  });

  it('la curva S tiene una descripción accesible y leyenda', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline });
    open();
    const chart = await screen.findByRole('img', { name: /Valor planeado/ });
    // El resumen usa el punto de hoy, o el último si hoy no está en la serie.
    expect(chart.getAttribute('aria-label')).toMatch(/Valor planeado .+, valor ganado .+, costo real .+\./);
    const legend = screen.getByRole('list', { name: 'Leyenda de la curva' });
    for (const text of ['Valor planeado (PV)', 'Valor ganado (EV)', 'Costo real (AC)']) expect(within(legend).getByText(text)).toBeInTheDocument();
  });

  it('la curva marca cada día con foto, aunque haya uno solo', async () => {
    const single = { ...withBaseline, series: withBaseline.series.map((p) => (p.date === '2026-11-05' ? p : { ...p, evCents: null, acCents: null })) };
    mockApi({ ...base, 'GET /api/projects/p1/performance': single });
    open();
    const chart = await screen.findByRole('img', { name: /Valor planeado/ });
    expect(chart.querySelectorAll('circle[data-series="evCents"]')).toHaveLength(1);
    expect(chart.querySelectorAll('circle[data-series="acCents"]')).toHaveLength(1);
  });

  it('la tabla por tarea muestra estado y desvío', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline });
    open();
    const table = await screen.findByRole('table', { name: 'Desempeño por tarea' });
    const row = (title: string) => within(table).getByText(title).closest('tr') as HTMLElement;
    expect(row('Diseño')).toHaveTextContent('Atrasada');
    expect(row('Diseño')).toHaveTextContent('+3 días');
    expect(row('Construcción')).toHaveTextContent('Eliminada');
    expect(row('Blog')).toHaveTextContent('Fuera de línea base');
    expect(screen.getByText('1 tarea con costo está fuera de la línea base.')).toBeInTheDocument();
  });

  it('fijar una nueva versión pide motivo y permite citar un cambio aprobado', async () => {
    const api = mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline, 'POST /api/projects/p1/baselines': { ...v2, version: 3 } });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Fijar nueva línea base' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Fijar nueva línea base' }));
    const select = dialog.getByLabelText('Cambio aprobado (opcional)');
    expect(within(select).getByRole('option', { name: 'CR-1 · Agregar blog' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /Pendiente/ })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Fijar' })).toBeDisabled();
    await user.type(dialog.getByLabelText('Motivo'), 'Replan');
    await user.selectOptions(select, 'cr1');
    await user.click(dialog.getByRole('button', { name: 'Fijar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/baselines')?.body).toEqual({ reason: 'Replan', changeRequestId: 'cr1' }));
  });

  it('el historial muestra versiones con autor y cambio', async () => {
    mockApi({ ...base, 'GET /api/projects/p1/performance': withBaseline });
    open();
    const history = await screen.findByRole('list', { name: 'Historial de líneas base' });
    const items = within(history).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Versión 2');
    expect(items[0]).toHaveTextContent('Paula');
    expect(items[0]).toHaveTextContent('CR-1');
    expect(items[1]).toHaveTextContent('Versión 1');
  });

  it('el colaborador no ve la pestaña Desempeño', async () => {
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects/p1': project, 'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] }, 'GET /api/projects/p1/objectives': [], 'GET /api/projects/p1/milestones': [], 'GET /api/projects/p1/members': [] });
    renderApp('/proyectos/p1/resumen');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).queryByRole('link', { name: 'Desempeño' })).not.toBeInTheDocument();
  });
});
