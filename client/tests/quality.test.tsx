import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const metric = (over: object = {}) => ({
  id: 'q1',
  name: 'Cobertura',
  unit: '%',
  target: 80,
  direction: 'HIGHER_BETTER',
  deliverable: null,
  latest: { date: '2026-11-15', value: 85 },
  met: true,
  measurements: [{ id: 'm1', date: '2026-11-15', value: 85, note: '' }],
  ...over,
});
const row = { id: 'd2', version: 4, number: 2, name: 'Portal publicado', status: 'IN_REVIEW', dueDate: null, overdue: false, milestone: null, criteriaMet: 0, criteriaTotal: 0, lastReview: null };
const detail = { ...row, description: '', criteria: [], reviews: [], work: [], incidents: [] };
const deliverableRoutes = (user: object, metrics: object[]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/deliverables': [row],
  'GET /api/projects/p1/deliverables/d2': detail,
  'GET /api/projects/p1/quality-metrics': metrics,
  'GET /api/projects/p1/stakeholders': [],
  'GET /api/projects/p1/attachments': [],
});

describe('calidad', () => {
  it('muestra cumple, no cumple y sin medir', async () => {
    mockApi(deliverableRoutes(pmUser, [metric(), metric({ id: 'q2', name: 'Defectos', direction: 'LOWER_BETTER', target: 2, latest: { date: '2026-11-15', value: 5 }, met: false }), metric({ id: 'q3', name: 'Rendimiento', latest: null, met: null, measurements: [] })]));
    renderApp('/proyectos/p1/entregables');
    const region = await screen.findByRole('region', { name: 'Calidad' });
    expect(await within(region).findByText('Cumple')).toBeInTheDocument();
    expect(within(region).getByText('No cumple')).toBeInTheDocument();
    expect(within(region).getByText('Sin medir')).toBeInTheDocument();
  });

  it('el PM registra una medición', async () => {
    const api = mockApi({ ...deliverableRoutes(pmUser, [metric()]), 'POST /api/projects/p1/quality-metrics/q1/measurements': metric() });
    renderApp('/proyectos/p1/entregables');
    const user = userEvent.setup();
    const region = await screen.findByRole('region', { name: 'Calidad' });
    await user.click(await within(region).findByRole('button', { name: 'Medir Cobertura' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Medir Cobertura' }));
    await user.clear(dialog.getByLabelText('Fecha'));
    await user.type(dialog.getByLabelText('Fecha'), '2026-11-16');
    await user.type(dialog.getByLabelText('Valor'), '87,5');
    await user.type(dialog.getByLabelText('Nota'), 'Sprint 4');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/quality-metrics/q1/measurements')?.body).toEqual({ date: '2026-11-16', value: 87.5, note: 'Sprint 4' }),
    );
  });

  it('el colaborador ve la calidad sin poder editarla', async () => {
    mockApi(deliverableRoutes(collaborator, [metric()]));
    renderApp('/proyectos/p1/entregables');
    const region = await screen.findByRole('region', { name: 'Calidad' });
    expect(await within(region).findByText('Cumple')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Añadir métrica' })).not.toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Medir Cobertura' })).not.toBeInTheDocument();
  });

  it('rechazar registra la no conformidad salvo que se desmarque', async () => {
    const api = mockApi({ ...deliverableRoutes(pmUser, []), 'POST /api/projects/p1/deliverables/d2/reviews': { ...detail, status: 'REJECTED', nonconformity: { id: 'i1', number: 1 } } });
    renderApp('/proyectos/p1/entregables');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver ENT-2' }));
    const deliverableDialog = within(await screen.findByRole('dialog', { name: 'ENT-2 · Portal publicado' }));
    await user.click(await deliverableDialog.findByRole('button', { name: 'Rechazar' }));
    const review = within(screen.getByRole('dialog', { name: 'Rechazar ENT-2' }));
    expect(review.getByRole('checkbox', { name: 'Registrar no conformidad' })).toBeChecked();
    expect(review.getByLabelText('Título de la no conformidad')).toHaveValue('No conformidad: Portal publicado');
    await user.type(review.getByLabelText('Nota'), 'No carga');
    await user.click(review.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/deliverables/d2/reviews')?.body).toMatchObject({ outcome: 'REJECTED', nonconformity: { title: 'No conformidad: Portal publicado' } }),
    );
  });

  it('sin la casilla no se envía la no conformidad', async () => {
    const api = mockApi({ ...deliverableRoutes(pmUser, []), 'POST /api/projects/p1/deliverables/d2/reviews': { ...detail, status: 'REJECTED', nonconformity: null } });
    renderApp('/proyectos/p1/entregables');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver ENT-2' }));
    const deliverableDialog = within(await screen.findByRole('dialog', { name: 'ENT-2 · Portal publicado' }));
    await user.click(await deliverableDialog.findByRole('button', { name: 'Rechazar' }));
    const review = within(screen.getByRole('dialog', { name: 'Rechazar ENT-2' }));
    await user.click(review.getByRole('checkbox', { name: 'Registrar no conformidad' }));
    await user.type(review.getByLabelText('Nota'), 'No carga');
    await user.click(review.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/deliverables/d2/reviews')?.body).not.toHaveProperty('nonconformity'));
  });

  it('el PM fija el tipo y el entregable de un incidente', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/members': [],
      'GET /api/projects/p1/tasks': [],
      'GET /api/projects/p1/deliverables': [row],
      'GET /api/projects/p1/incidents': [],
      'POST /api/projects/p1/incidents': { id: 'i1', number: 1 },
    });
    renderApp('/proyectos/p1/incidentes');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reportar incidente' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Reportar incidente' }));
    await user.type(dialog.getByLabelText('Título'), 'Botón roto');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'DEFECT');
    await user.selectOptions(await dialog.findByLabelText('Entregable'), 'd2');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/incidents')?.body).toMatchObject({ title: 'Botón roto', kind: 'DEFECT', deliverableId: 'd2' }));
  });
});
