import { localToday } from '@pm/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

// Sábado 7 de noviembre de 2026, 23:30 hora local.
const NOW = new Date(2026, 10, 7, 23, 30);
const NOV = 'GET /api/calendar?from=2026-10-26&to=2026-12-06';
const DEC = 'GET /api/calendar?from=2026-11-30&to=2027-01-03';

const task = (id: string, title: string, dueDate: string, over: object = {}) => ({
  id,
  title,
  dueDate,
  status: 'TODO',
  projectId: 'p1',
  projectName: 'Portal',
  assignees: [{ id: 'c1', name: 'Carlos' }],
  ...over,
});
const calendar = {
  tasks: [
    task('t1', 'Vencida', '2026-11-03'),
    task('t2', 'Terminada', '2026-11-04', { status: 'DONE' }),
    task('t3', 'Futura', '2026-11-20', { projectId: 'p2', projectName: 'ERP', assignees: [{ id: 'c2', name: 'Diana' }] }),
    task('a', 'Uno', '2026-11-18'),
    task('b', 'Dos', '2026-11-18'),
    task('c', 'Tres', '2026-11-18'),
    task('d', 'Cuatro', '2026-11-18'),
  ],
  milestones: [{ id: 'm1', name: 'Diseño aprobado', dueDate: '2026-11-25', status: 'PENDING', projectId: 'p1', projectName: 'Portal' }],
  undated: [{ id: 'u1', title: 'Sin fecha', status: 'TODO', projectId: 'p1', projectName: 'Portal' }],
};
const emptyCalendar = { tasks: [], milestones: [], undated: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const projects = [
  { id: 'p1', name: 'Portal', status: 'EXECUTING' },
  { id: 'p2', name: 'ERP', status: 'EXECUTING' },
  { id: 'p3', name: 'Viejo', status: 'CLOSED' },
];
const users = [
  { id: 'c1', name: 'Carlos', role: 'COLLABORATOR', active: true },
  { id: 'c2', name: 'Diana', role: 'COLLABORATOR', active: true },
  { id: 'pm', name: 'Paula', role: 'PM', active: true },
];

const open = async (user0: object = pmUser, data: object = calendar) => {
  const api = mockApi({ ...signedInAs(user0), 'GET /api/projects': projects, 'GET /api/users': users, 'GET /api/me/tasks': [], [NOV]: data, [DEC]: emptyCalendar });
  renderApp('/calendario');
  const main = within(await screen.findByRole('main'));
  await main.findByRole('heading', { name: 'Noviembre 2026' });
  return { api, main, user: userEvent.setup() };
};
const day = (main: ReturnType<typeof within>, date: string) => within(main.getByTestId(`day-${date}`));

describe('calendario', () => {
  it('destaca hoy según la fecha local', async () => {
    expect(localToday(NOW)).toBe('2026-11-07');
    const { main } = await open();
    expect(main.getByTestId('day-2026-11-07').querySelector('[aria-current="date"]')).not.toBeNull();
  });

  it('coloca tareas e hitos en su día, con enlaces', async () => {
    const { main } = await open();
    expect(await day(main, '2026-11-20').findByRole('link', { name: /Futura/ })).toHaveAttribute('href', '/proyectos/p2/tareas/t3');
    expect(day(main, '2026-11-25').getByRole('link', { name: /Diseño aprobado/ })).toHaveAttribute('href', '/proyectos/p1/resumen');
  });

  it('la vencida se marca con texto accesible', async () => {
    const { main } = await open();
    expect(await day(main, '2026-11-03').findByRole('link', { name: 'Vencida, vencida' })).toBeInTheDocument();
  });

  it('las terminadas se ocultan hasta activarlas', async () => {
    const { main, user } = await open();
    await day(main, '2026-11-03').findByRole('link', { name: /Vencida/ });
    expect(main.queryByRole('link', { name: /Terminada/ })).not.toBeInTheDocument();
    await user.click(main.getByLabelText('Mostrar terminadas'));
    expect(day(main, '2026-11-04').getByRole('link', { name: /Terminada/ })).toHaveClass('line-through');
  });

  it('más de 3 elementos muestran "+N más" y abre la lista del día', async () => {
    const { main, user } = await open();
    const cell = day(main, '2026-11-18');
    await user.click(await cell.findByRole('button', { name: '+1 más' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getAllByRole('link')).toHaveLength(4);
  });

  it('cambiar de mes pide el nuevo rango y Hoy vuelve al mes actual', async () => {
    const { api, main, user } = await open();
    await user.click(main.getByRole('button', { name: 'Mes siguiente' }));
    expect(await main.findByRole('heading', { name: 'Diciembre 2026' })).toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((c) => c.key === DEC)).toBe(true));
    await user.click(main.getByRole('button', { name: 'Hoy' }));
    expect(await main.findByRole('heading', { name: 'Noviembre 2026' })).toBeInTheDocument();
  });

  it('filtra por proyecto, tipo y persona', async () => {
    const { main, user } = await open();
    await day(main, '2026-11-20').findByRole('link', { name: /Futura/ });
    await user.selectOptions(main.getByLabelText('Proyecto'), 'p1');
    expect(main.queryByRole('link', { name: /Futura/ })).not.toBeInTheDocument();
    await user.selectOptions(main.getByLabelText('Proyecto'), 'ALL');
    await user.selectOptions(main.getByLabelText('Persona'), 'c2');
    expect(main.getByRole('link', { name: /Futura/ })).toBeInTheDocument();
    expect(main.queryByRole('link', { name: /Vencida/ })).not.toBeInTheDocument();
    await user.selectOptions(main.getByLabelText('Persona'), 'ALL');
    await user.click(main.getByRole('button', { name: 'Solo hitos' }));
    expect(main.queryByRole('link', { name: /Futura/ })).not.toBeInTheDocument();
    expect(main.getByRole('link', { name: /Diseño aprobado/ })).toBeInTheDocument();
  });

  it('el filtro de proyecto se mantiene visible al cambiar de mes y ofrece limpiarlo', async () => {
    const { main, user } = await open();
    await day(main, '2026-11-20').findByRole('link', { name: /Futura/ });
    await waitFor(() => expect(within(main.getByLabelText('Proyecto')).getByRole('option', { name: 'ERP' })).toBeInTheDocument());
    await user.selectOptions(main.getByLabelText('Proyecto'), 'p2');
    await user.click(main.getByRole('button', { name: 'Mes siguiente' }));
    await main.findByRole('heading', { name: 'Diciembre 2026' });
    expect(main.getByLabelText('Proyecto')).toHaveValue('p2');
    await user.click(await main.findByRole('button', { name: 'Limpiar filtros' }));
    expect(main.getByLabelText('Proyecto')).toHaveValue('ALL');
  });

  it('las opciones incluyen proyectos activos sin actividad este mes, y a todos los colaboradores', async () => {
    const { main } = await open(pmUser, emptyCalendar);
    await waitFor(() => expect(within(main.getByLabelText('Proyecto')).getByRole('option', { name: 'ERP' })).toBeInTheDocument());
    expect(within(main.getByLabelText('Proyecto')).queryByRole('option', { name: 'Viejo' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(main.getByLabelText('Persona')).getByRole('option', { name: 'Diana' })).toBeInTheDocument());
    expect(within(main.getByLabelText('Persona')).queryByRole('option', { name: 'Paula' })).not.toBeInTheDocument();
  });

  it('el colaborador no ve el filtro de persona', async () => {
    const { main } = await open(collaborator);
    expect(main.queryByLabelText('Persona')).not.toBeInTheDocument();
    expect(main.getByLabelText('Proyecto')).toBeInTheDocument();
  });

  it('el contador de tareas sin fecha abre su lista', async () => {
    const { main, user } = await open();
    await user.click(await main.findByRole('button', { name: '1 tarea sin fecha' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('link', { name: /Sin fecha/ })).toHaveAttribute('href', '/proyectos/p1/tareas/u1');
  });

  it('un mes sin actividades muestra el mensaje', async () => {
    const { main } = await open(pmUser, emptyCalendar);
    expect(await main.findByText('No hay actividades en este mes')).toBeInTheDocument();
  });

  it('en móvil muestra una lista de días con actividades', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    const { main } = await open();
    expect(await main.findByRole('heading', { name: /3 nov 2026/ })).toBeInTheDocument();
    expect(main.queryByTestId('day-2026-11-07')).not.toBeInTheDocument();
  });
});
