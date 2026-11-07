import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const base = { description: '', approach: 'AGILE', startDate: null, currency: 'USD', team: [{ id: 'c', name: 'Carlos Vega' }] };
const portal = { ...base, id: 'p1', name: 'Portal de clientes', status: 'EXECUTING', progress: 68, endDate: '2027-01-29', plannedBudgetCents: 4500000, spentCents: 1800000, health: 'ON_TRACK', overdueTasks: 0, highRisks: 0 };
const sucursal = { ...base, id: 'p2', name: 'Nueva sucursal', status: 'EXECUTING', progress: 23, endDate: '2026-11-30', plannedBudgetCents: 5000000, spentCents: 4700000, health: 'AT_RISK', overdueTasks: 3, highRisks: 1 };
const viejo = { ...base, id: 'p3', name: 'Viejo', status: 'CLOSED', progress: 100, endDate: null, plannedBudgetCents: 0, spentCents: 500, health: null, overdueTasks: 0, highRisks: 0 };

const open = async () => {
  mockApi({ ...signedInAs(pmUser), 'GET /api/projects': [portal, sucursal, viejo] });
  renderApp('/proyectos');
  const main = within(await screen.findByRole('main'));
  await main.findByRole('link', { name: 'Portal de clientes' });
  return main;
};

const rows = (main: ReturnType<typeof within>) =>
  main.getAllByRole('row').slice(1).map((row: HTMLElement) => within(row).getAllByRole('cell')[0]!.textContent);

describe('tabla de proyectos del PM', () => {
  it('muestra salud, avance, presupuesto y alertas', async () => {
    const main = await open();
    expect(within(main.getByRole('row', { name: /Nueva sucursal/ })).getByText('En riesgo')).toBeInTheDocument();
    expect(main.getByText('23 %')).toBeInTheDocument();
    expect(main.getByText(/3 vencidas/)).toBeInTheDocument();
    expect(main.getByText(/1 riesgo alto/)).toBeInTheDocument();
    expect(main.getByText('Sin alertas')).toBeInTheDocument();
    expect(main.getByText(/18\.000,00.*de.*45\.000,00/)).toBeInTheDocument();
  });

  it('Activos es el filtro inicial y el contador lo refleja', async () => {
    const main = await open();
    expect(main.queryByRole('link', { name: 'Viejo' })).not.toBeInTheDocument();
    expect(main.getByText('2 de 3 proyectos')).toBeInTheDocument();
  });

  it('ordena por salud al inicio y el encabezado tiene aria-sort', async () => {
    const main = await open();
    expect(rows(main)[0]).toContain('Nueva sucursal');
    expect(main.getByRole('columnheader', { name: /salud/i })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('al hacer clic en un encabezado cambia el orden', async () => {
    const main = await open();
    await userEvent.setup().click(main.getByRole('button', { name: 'Ordenar por proyecto' }));
    expect(rows(main)[0]).toContain('Nueva sucursal');
    expect(main.getByRole('columnheader', { name: /proyecto/i })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.setup().click(main.getByRole('button', { name: 'Ordenar por proyecto' }));
    expect(rows(main)[0]).toContain('Portal de clientes');
    expect(main.getByRole('columnheader', { name: /proyecto/i })).toHaveAttribute('aria-sort', 'descending');
  });

  it('búsqueda sin acentos y filtro de salud', async () => {
    const main = await open();
    const user = userEvent.setup();
    await user.type(main.getByLabelText('Buscar proyectos'), 'SUCURSAL');
    expect(main.getByText('1 de 3 proyectos')).toBeInTheDocument();
    await user.clear(main.getByLabelText('Buscar proyectos'));
    await user.selectOptions(main.getByLabelText('Salud'), 'ON_TRACK');
    expect(main.getByRole('link', { name: 'Portal de clientes' })).toBeInTheDocument();
    expect(main.queryByRole('link', { name: 'Nueva sucursal' })).not.toBeInTheDocument();
  });

  it('un proyecto con presupuesto 0 muestra la barra vacía, sin valores inválidos', async () => {
    const main = await open();
    await userEvent.setup().selectOptions(main.getByLabelText('Estado'), 'ALL');
    const bar = within(main.getByRole('row', { name: /Viejo/ })).getByRole('progressbar', { name: 'Presupuesto de Viejo' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('desde 90 % la barra usa el color de atención', async () => {
    const main = await open();
    expect(main.getByRole('progressbar', { name: 'Presupuesto de Nueva sucursal' }).firstElementChild).toHaveClass('bg-warn-fg');
    expect(main.getByRole('progressbar', { name: 'Presupuesto de Portal de clientes' }).firstElementChild).not.toHaveClass('bg-warn-fg');
  });

  it('la tabla mantiene su encabezado a la vista', async () => {
    const main = await open();
    const wrapper = main.getByRole('table').parentElement!;
    expect(wrapper).toHaveClass('overflow-auto');
    expect(wrapper.className).toMatch(/max-h-/);
  });

  it('sin resultados ofrece limpiar los filtros', async () => {
    const main = await open();
    const user = userEvent.setup();
    await user.type(main.getByLabelText('Buscar proyectos'), 'zzz');
    await user.click(main.getByRole('button', { name: 'Limpiar filtros' }));
    expect(main.getByRole('link', { name: 'Nueva sucursal' })).toBeInTheDocument();
  });
});

describe('tabla de proyectos del colaborador', () => {
  it('no ve salud, presupuesto ni alertas, y se ordena por proyecto', async () => {
    const hidden = ({ id, name, status, progress, endDate, team, description, approach, startDate }: typeof portal) => ({ id, name, status, progress, endDate, team, description, approach, startDate });
    mockApi({ ...signedInAs(collaborator), 'GET /api/projects': [hidden(portal), hidden(sucursal)], 'GET /api/me/tasks': [] });
    renderApp('/proyectos');
    const main = within(await screen.findByRole('main'));
    await main.findByRole('link', { name: 'Portal de clientes' });
    expect(main.queryByRole('columnheader', { name: /salud/i })).not.toBeInTheDocument();
    expect(main.queryByRole('columnheader', { name: /Presupuesto/ })).not.toBeInTheDocument();
    expect(main.queryByRole('columnheader', { name: /Alertas/ })).not.toBeInTheDocument();
    expect(main.queryByLabelText('Salud')).not.toBeInTheDocument();
    expect(rows(main)[0]).toContain('Nueva sucursal');
  });
});
