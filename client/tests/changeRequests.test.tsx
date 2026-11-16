import { formatMoney } from '@pm/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const cr = (over: object = {}) => ({
  id: 'cr2',
  number: 2,
  title: 'Agregar blog',
  description: 'Un blog en el sitio',
  requestedBy: 'Dirección',
  scopeImpact: 'Nueva sección',
  scheduleImpactDays: 3,
  costImpactCents: 80000,
  status: 'PENDING',
  decisionNote: '',
  decidedAt: null,
  decidedBy: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  ...over,
});
const decided = cr({
  id: 'cr1',
  number: 1,
  title: 'Quitar reportes',
  scheduleImpactDays: -2,
  costImpactCents: -5000,
  status: 'APPROVED',
  decisionNote: 'Ahorra tiempo',
  decidedAt: '2026-11-07T12:00:00.000Z',
  decidedBy: { id: 'pm', name: 'Paula' },
});
const base = { ...signedInAs(pmUser), 'GET /api/projects/p1': project };
const url = '/api/projects/p1/change-requests';
const open = () => renderApp('/proyectos/p1/cambios');
const money = (cents: number) => formatMoney(cents, 'USD').replace(/\s+/g, ' ');

describe('pestaña Cambios', () => {
  it('lista con número, impactos y estado', async () => {
    mockApi({ ...base, [`GET ${url}`]: [cr(), decided] });
    open();
    const table = await screen.findByRole('table');
    const row = (text: string) => within(table).getByText(text).closest('tr') as HTMLElement;
    await within(table).findByText('CR-2');
    expect(row('CR-2')).toHaveTextContent('+3 días');
    expect(row('CR-2')).toHaveTextContent(money(80000));
    expect(row('CR-2')).toHaveTextContent('Pendiente');
    expect(row('CR-1')).toHaveTextContent('−2 días');
    expect(row('CR-1')).toHaveTextContent('Aprobada');
  });

  it('crear un cambio', async () => {
    const api = mockApi({
      ...base,
      [`GET ${url}`]: [],
      [`POST ${url}`]: (body: { title: string }) => (body.title ? cr() : apiError(400, 'validation_error', { fields: { title: 'Escribe el título' } })),
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir cambio' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir cambio' }));
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await dialog.findByText('Escribe el título')).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Título'), 'Agregar blog');
    await user.type(dialog.getByLabelText('Descripción'), 'Un blog');
    await user.type(dialog.getByLabelText('Solicitado por'), 'Dirección');
    await user.type(dialog.getByLabelText('Impacto en alcance'), 'Nueva sección');
    await user.type(dialog.getByLabelText('Impacto en plazo (días)'), '-3');
    await user.type(dialog.getByLabelText('Impacto en costo'), '-1.234,50');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = api.calls.filter((c) => c.key === `POST ${url}`);
    expect(posts.at(-1)?.body).toEqual({
      title: 'Agregar blog',
      description: 'Un blog',
      requestedBy: 'Dirección',
      scopeImpact: 'Nueva sección',
      scheduleImpactDays: -3,
      costImpactCents: -123450,
    });
  });

  it('un impacto en costo inválido no se envía', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [], [`POST ${url}`]: cr() });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir cambio' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Título'), 'X');
    await user.type(dialog.getByLabelText('Impacto en costo'), 'mil');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await dialog.findByText(/Monto inválido/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.key === `POST ${url}`)).toBe(false);
  });

  it('aprobar pide nota', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [cr()], [`POST ${url}/cr2/decision`]: cr({ status: 'APPROVED' }) });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aprobar CR-2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Aprobar CR-2' }));
    const confirm = dialog.getByRole('button', { name: 'Aprobar' });
    expect(confirm).toBeDisabled();
    await user.type(dialog.getByLabelText('Nota de la decisión'), 'Vale la pena');
    await user.click(confirm);
    await waitFor(() => expect(api.calls.find((c) => c.key === `POST ${url}/cr2/decision`)?.body).toEqual({ status: 'APPROVED', note: 'Vale la pena' }));
  });

  it('rechazar también pide nota', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [cr()], [`POST ${url}/cr2/decision`]: cr({ status: 'REJECTED' }) });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rechazar CR-2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Rechazar CR-2' }));
    await user.type(dialog.getByLabelText('Nota de la decisión'), 'Fuera de presupuesto');
    await user.click(dialog.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `POST ${url}/cr2/decision`)?.body).toEqual({ status: 'REJECTED', note: 'Fuera de presupuesto' }));
  });

  it('una decidida solo tiene Ver', async () => {
    mockApi({ ...base, [`GET ${url}`]: [decided] });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver CR-1' }));
    for (const name of ['Editar CR-1', 'Eliminar CR-1', 'Aprobar CR-1', 'Rechazar CR-1']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    const dialog = within(screen.getByRole('dialog', { name: 'CR-1 · Quitar reportes' }));
    expect(dialog.getByText('Ahorra tiempo')).toBeInTheDocument();
    expect(dialog.getByText(/Paula/)).toBeInTheDocument();
  });

  it('una pendiente se edita y se elimina', async () => {
    const api = mockApi({ ...base, [`GET ${url}`]: [cr()], [`PATCH ${url}/cr2`]: cr({ title: 'Blog y noticias' }), [`DELETE ${url}/cr2`]: { ok: true } });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar CR-2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Editar CR-2' }));
    expect(dialog.getByLabelText('Impacto en costo')).toHaveValue('800,00');
    const title = dialog.getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Blog y noticias');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/cr2`)?.body).toMatchObject({ title: 'Blog y noticias', costImpactCents: 80000, scheduleImpactDays: 3 }));
    await user.click(screen.getByRole('button', { name: 'Eliminar CR-2' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar cambio' })).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(api.calls.some((c) => c.key === `DELETE ${url}/cr2`)).toBe(true));
  });

  it('un 409 muestra el motivo y recarga el registro', async () => {
    const api = mockApi({
      ...base,
      [`GET ${url}`]: [cr()],
      [`POST ${url}/cr2/decision`]: apiError(409, 'change_decided', { message: 'Esta solicitud ya fue decidida y no se puede modificar' }),
    });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aprobar CR-2' }));
    await user.type(screen.getByLabelText('Nota de la decisión'), 'Ok');
    const gets = () => api.calls.filter((c) => c.key === `GET ${url}`).length;
    const before = gets();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Esta solicitud ya fue decidida y no se puede modificar')).toBeInTheDocument();
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
  });

  it('una propuesta del equipo muestra quién la propuso y no se elimina', async () => {
    mockApi({ ...base, [`GET ${url}`]: [cr({ proposedBy: { id: 'c1', name: 'Carlos' } }), cr({ id: 'cr3', number: 3, title: 'Del PM', proposedBy: null })] });
    open();
    expect(await screen.findByText('Propuesta por Carlos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar CR-2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar CR-2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar CR-3' })).toBeInTheDocument();
  });

describe('aplicar un cambio aprobado', () => {
  const dated = { ...project, endDate: '2026-06-30', plannedBudgetCents: 100000 };
  const approved = cr({ id: 'cr1', number: 1, scheduleImpactDays: 10, costImpactCents: 5000, status: 'APPROVED', decisionNote: 'Ok', decidedAt: '2026-11-07T12:00:00.000Z', decidedBy: { id: 'pm', name: 'Paula' } });
  const routes = (over: object = {}, performance: object | null = { baseline: { version: 1 } }) => ({
    ...base,
    'GET /api/projects/p1': dated,
    [`GET ${url}`]: [approved, cr({ id: 'cr3', number: 3, status: 'REJECTED' }), cr({ id: 'cr4', number: 4, status: 'APPLIED' })],
    'GET /api/projects/p1/performance': performance ?? { baseline: null },
    [`POST ${url}/cr1/apply`]: { ...approved, status: 'APPLIED' },
    ...over,
  });
  const openDialog = async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aplicar CR-1' }));
    return { user, dialog: within(await screen.findByRole('dialog', { name: 'Aplicar CR-1' })) };
  };
  const sent = (api: ReturnType<typeof mockApi>) => api.calls.find((c) => c.key === `POST ${url}/cr1/apply`)?.body;

  it('solo una aprobada tiene Aplicar, y una aplicada muestra su estado', async () => {
    mockApi(routes());
    open();
    expect(await screen.findByRole('button', { name: 'Aplicar CR-1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar CR-3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar CR-4' })).not.toBeInTheDocument();
    const row = screen.getByText('CR-4').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Aplicada');
  });

  it('propone la fecha, el presupuesto, la línea base y el motivo, y los envía', async () => {
    const api = mockApi(routes());
    const { user, dialog } = await openDialog();
    expect(dialog.getByLabelText('Nueva fecha de fin')).toHaveValue('2026-07-10');
    expect(dialog.getByLabelText('Nuevo presupuesto')).toHaveValue('1050,00');
    await waitFor(() => expect(dialog.getByLabelText('Fijar nueva línea base citando este cambio')).toBeChecked());
    expect(dialog.getByLabelText('Motivo')).toHaveValue('CR-1 Agregar blog');
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(sent(api)).toEqual({ endDate: '2026-07-10', plannedBudgetCents: 105000, baseline: true, reason: 'CR-1 Agregar blog' }));
  });

  it('no envía la fecha si queda igual a la actual', async () => {
    const api = mockApi(routes());
    const { user, dialog } = await openDialog();
    const date = dialog.getByLabelText('Nueva fecha de fin');
    await user.clear(date);
    await user.type(date, '2026-06-30');
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(sent(api)).toBeTruthy());
    expect(sent(api)).not.toHaveProperty('endDate');
  });

  it('sin impactos ni línea base propone los valores actuales', async () => {
    const empty = { ...approved, scheduleImpactDays: null, costImpactCents: null };
    const api = mockApi(routes({ [`GET ${url}`]: [empty] }, null));
    const { user, dialog } = await openDialog();
    expect(dialog.getByLabelText('Nueva fecha de fin')).toHaveValue('2026-06-30');
    expect(dialog.getByLabelText('Fijar nueva línea base citando este cambio')).not.toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(sent(api)).toEqual({ baseline: false, reason: 'CR-1 Agregar blog' }));
  });

  it('muestra el error de campo de la API', async () => {
    mockApi(routes({ [`POST ${url}/cr1/apply`]: apiError(400, 'validation_error', { fields: { endDate: '1 tarea quedaría fuera del proyecto. Ajusta sus fechas primero.' } }) }));
    const { user, dialog } = await openDialog();
    await user.click(dialog.getByRole('button', { name: 'Aplicar' }));
    expect(await dialog.findByText('1 tarea quedaría fuera del proyecto. Ajusta sus fechas primero.')).toBeInTheDocument();
  });
});
});
