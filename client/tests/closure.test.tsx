import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: '2026-01-01', endDate: '2026-06-30', plannedBudgetCents: 100000, currency: 'USD', closedAt: null };
const report = (over: object = {}) => ({
  dates: { plannedStart: '2026-01-01', plannedEnd: '2026-06-30', actualStart: '2026-01-03', actualEnd: '2026-07-10', endVarianceDays: 10 },
  budget: { plannedCents: 100000, actualCents: 120000, varianceCents: -20000, currency: 'USD' },
  performance: { cpi: 0.8, spi: 1, eacCents: 125000, vacCents: -25000 },
  objectives: { met: 2, notMet: 1, pending: 0 },
  deliverables: { PENDING: 0, IN_REVIEW: 0, ACCEPTED: 2, REJECTED: 0 },
  changes: { approved: 1, rejected: 0, pending: 0 },
  incidents: { total: 3, open: 0 },
  risks: { total: 2, open: 0 },
  pendings: [],
  ...over,
});
const paula = { id: 'u-pm', name: 'Paula' };
const state = (over: object = {}) => ({ status: 'open', legacy: false, report: report(), current: null, history: [], ...over });
const routes = (closure: object, proj: object = project) => ({
  ...signedInAs(pmUser),
  'GET /api/projects/p1': proj,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/closure': closure,
});
const open = () => renderApp('/proyectos/p1/cierre');

describe('pestaña Cierre', () => {
  it('abierto: pendientes con enlaces y vista previa', async () => {
    mockApi(routes(state({ report: report({ pendings: [{ kind: 'tasks', count: 2 }] }) })));
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Cierre' })).toBeInTheDocument();
    const pendings = await screen.findByRole('region', { name: 'Pendientes' });
    expect(within(pendings).getByText('Tareas sin terminar')).toBeInTheDocument();
    expect(within(pendings).getByRole('link', { name: /Tareas sin terminar/ })).toHaveAttribute('href', '/proyectos/p1/tareas');
    expect(screen.getByText('Vista previa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Presupuesto' })).toBeInTheDocument();
  });

  it('sin pendientes', async () => {
    mockApi(routes(state()));
    open();
    expect(await screen.findByText('Sin pendientes')).toBeInTheDocument();
  });

  it('cerrar exige motivo si hay pendientes', async () => {
    const api = mockApi({ ...routes(state({ report: report({ pendings: [{ kind: 'tasks', count: 2 }] }) })), 'POST /api/projects/p1/closure': state({ status: 'closed' }) });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cerrar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Cerrar proyecto' }));
    const confirm = dialog.getByRole('button', { name: 'Cerrar proyecto' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(dialog.getByLabelText('Estado final'), 'CANCELLED');
    await user.type(dialog.getByLabelText('Motivo de los pendientes'), 'Se canceló el contrato');
    await user.click(confirm);
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/closure')?.body).toEqual({ finalStatus: 'CANCELLED', summary: '', pendingReason: 'Se canceló el contrato' }),
    );
  });

  it('sin pendientes no pide motivo', async () => {
    mockApi(routes(state()));
    open();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar proyecto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Cerrar proyecto' }));
    expect(dialog.queryByLabelText('Motivo de los pendientes')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Cerrar proyecto' })).toBeEnabled();
  });

  it('cerrado: informe congelado, imprimir e historial', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const closedAt = '2026-11-20T10:00:00.000Z';
    mockApi(
      routes(
        state({
          status: 'closed',
          current: { finalStatus: 'CLOSED', summary: '<p>Entregado</p>', pendingReason: 'Quedó una tarea', closedAt, closedBy: paula },
          history: [
            { id: 'c2', finalStatus: 'CLOSED', closedAt, closedBy: paula, reopenedAt: null, reopenedBy: null, reopenReason: '', pendingReason: '', summary: '', report: report() },
            { id: 'c1', finalStatus: 'CLOSED', closedAt: '2026-11-10T10:00:00.000Z', closedBy: paula, reopenedAt: '2026-11-12T10:00:00.000Z', reopenedBy: paula, reopenReason: 'Fase 2', pendingReason: '', summary: '', report: report() },
          ],
        }),
        { ...project, status: 'CLOSED', closedAt },
      ),
    );
    open();
    expect(await screen.findByText('Entregado')).toBeInTheDocument();
    expect(screen.getByText('Quedó una tarea')).toBeInTheDocument();
    expect(screen.queryByText('Vista previa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar proyecto' })).not.toBeInTheDocument();
    const history = within(screen.getByRole('region', { name: 'Historial de cierre' }));
    expect(history.getByText(/Reabierto el 12 nov 2026 por Paula: Fase 2/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Imprimir informe' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('sin línea base', async () => {
    mockApi(routes(state({ report: report({ performance: null }) })));
    open();
    expect(await screen.findByText('Sin línea base')).toBeInTheDocument();
  });

  it('legacy', async () => {
    mockApi(routes(state({ status: 'closed', legacy: true }), { ...project, status: 'CLOSED' }));
    open();
    expect(await screen.findByText('Cerrado antes del registro de cierres')).toBeInTheDocument();
  });

  it('el informe cuenta los cambios aplicados', async () => {
    mockApi(routes(state({ report: report({ changes: { approved: 1, applied: 3, rejected: 0, pending: 0 } }) })));
    open();
    const label = await screen.findByText('Aplicados');
    expect(label.nextElementSibling).toHaveTextContent('3');
  });

  it('un informe congelado antes de los cambios aplicados muestra 0', async () => {
    mockApi(routes(state()));
    open();
    const label = await screen.findByText('Aplicados');
    expect(label.nextElementSibling).toHaveTextContent('0');
  });
});
