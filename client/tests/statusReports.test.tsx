import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, observer, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: '2026-11-01', endDate: '2026-12-31', closedAt: null };
const snapshot = (over: object = {}) => ({
  health: 'ATTENTION',
  progress: { percent: 40, overdueTasks: 1, blockedTasks: 0, doneTasks: 2, totalTasks: 5 },
  performance: { cpi: 0.9, spi: 1.1, eacMethod: 'CPI', pvCents: 1000, evCents: 1100, acCents: 1222, eacCents: 22000, vacCents: -2000 },
  budget: { plannedCents: 50000, actualCents: 12000, varianceCents: 38000, currency: 'USD' },
  milestones: { reached: [{ name: 'Diseño', dueDate: '2026-11-10' }], upcoming: [], overdue: [] },
  risks: { openCount: 1, top: [{ description: 'Lluvias', score: 16, high: true, status: 'OPEN' }] },
  incidents: { open: 1, openedInPeriod: 1, resolvedInPeriod: 0 },
  changes: { pending: 0, approvedInPeriod: 1, rejectedInPeriod: 0, appliedInPeriod: 0 },
  ...over,
});
const issued = (over: object = {}) => ({
  id: 'r1',
  number: 1,
  periodStart: '2026-11-01',
  periodEnd: '2026-11-16',
  issuedAt: '2026-11-16T15:00:00Z',
  issuedBy: { id: 'pm', name: 'Paula' },
  comment: '<p>Vamos bien</p>',
  nextSteps: '<p>Instalar</p>',
  report: snapshot(),
  ...over,
});
const base = (user: object) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/indicators': { progress: 40, overdueTasks: 1, blockedTasks: 0, upcomingMilestones: [] },
});

describe('informes de estado', () => {
  it('el PM emite un informe tras confirmar', async () => {
    const api = mockApi({
      ...base(pmUser),
      'GET /api/projects/p1/status-reports': { items: [], due: true },
      'GET /api/projects/p1/status-reports/draft': { periodStart: '2026-11-01', periodEnd: '2026-11-16', report: snapshot() },
      'POST /api/projects/p1/status-reports': issued(),
      'GET /api/projects/p1/status-reports/r1': issued(),
    });
    renderApp('/proyectos/p1/informes');
    const user = userEvent.setup();
    expect(await screen.findByText('Toca emitir el informe de estado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nuevo informe' }));
    expect(await screen.findByText('Vista previa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Emitir' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Emitir informe' }));
    expect(dialog.getByText('Una vez emitido, el informe no se puede editar')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Emitir' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/status-reports')?.body).toEqual({ comment: '', nextSteps: '' }));
    expect(await screen.findByRole('heading', { name: 'Informe 1' })).toBeInTheDocument();
  });

  it('el observador ve el informe sin presupuesto ni botón de emitir', async () => {
    const { budget: _b, ...pub } = snapshot({ performance: { cpi: 0.9, spi: 1.1, eacMethod: 'CPI' } });
    mockApi({
      ...base(observer),
      'GET /api/projects/p1/status-reports': { items: [issued()], due: false },
      'GET /api/projects/p1/status-reports/r1': issued({ report: pub }),
    });
    renderApp('/proyectos/p1/informes/r1');
    expect(await screen.findByRole('heading', { name: 'Informe 1' })).toBeInTheDocument();
    expect(screen.getByText('0,90')).toBeInTheDocument();
    expect(screen.getByText('1,10')).toBeInTheDocument();
    expect(screen.getByText('Lluvias')).toBeInTheDocument();
    expect(screen.getByText('Vamos bien')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Presupuesto' })).not.toBeInTheDocument();
    expect(screen.queryByText('EAC')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo informe' })).not.toBeInTheDocument();
  });

  it('el PM ve el presupuesto en el informe', async () => {
    mockApi({ ...base(pmUser), 'GET /api/projects/p1/status-reports/r1': issued() });
    renderApp('/proyectos/p1/informes/r1');
    expect(await screen.findByRole('heading', { name: 'Presupuesto' })).toBeInTheDocument();
  });

  it('la pestaña Informes aparece al observador y no al colaborador', async () => {
    mockApi({ ...base(observer), 'GET /api/projects/p1/status-reports': { items: [issued()], due: false } });
    const first = renderApp('/proyectos/p1/resumen');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Informes' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Último informe: Informe 1/ })).toHaveAttribute('href', '/proyectos/p1/informes/r1');
    first.unmount();
    mockApi(base(collaborator));
    renderApp('/proyectos/p1/resumen');
    const collabTabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(collabTabs).queryByRole('link', { name: 'Informes' })).not.toBeInTheDocument();
  });
});
