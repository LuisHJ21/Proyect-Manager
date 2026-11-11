import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

export const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
export const row = (over: object = {}) => ({
  id: 'd2',
  number: 2,
  name: 'Portal publicado',
  status: 'IN_REVIEW',
  dueDate: '2026-11-01',
  overdue: true,
  milestone: { id: 'm1', name: 'Lanzamiento' },
  criteriaMet: 1,
  criteriaTotal: 3,
  lastReview: null,
  ...over,
});
export const url = '/api/projects/p1/deliverables';
export const baseRoutes = (user: object = pmUser) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/milestones': [{ id: 'm1', name: 'Lanzamiento', dueDate: '2026-12-01', status: 'PENDING' }],
});
const open = () => renderApp('/proyectos/p1/entregables');

describe('pestaña Entregables', () => {
  it('el colaborador no ve la pestaña', async () => {
    mockApi({ ...baseRoutes(collaborator), 'GET /api/projects/p1/incidents': [] });
    renderApp('/proyectos/p1/incidentes');
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).queryByRole('link', { name: 'Entregables' })).not.toBeInTheDocument();
  });

  it('lista', async () => {
    mockApi({ ...baseRoutes(), [`GET ${url}`]: [row()] });
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Entregables' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const tr = within(table).getByText('ENT-2').closest('tr') as HTMLElement;
    for (const text of ['Portal publicado', 'Lanzamiento', 'Vencido', '1/3', 'En revisión']) expect(tr).toHaveTextContent(text);
    expect(table.parentElement).toHaveClass('overflow-x-auto', 'relative');
  });

  it('vacía', async () => {
    mockApi({ ...baseRoutes(), [`GET ${url}`]: [] });
    open();
    expect(await screen.findByText('Aún no hay entregables.')).toBeInTheDocument();
  });

  it('filtro', async () => {
    const api = mockApi({ ...baseRoutes(), [`GET ${url}`]: [row()], [`GET ${url}?status=ACCEPTED`]: [] });
    open();
    await userEvent.setup().selectOptions(await screen.findByLabelText('Estado'), 'ACCEPTED');
    await waitFor(() => expect(api.calls.some((c) => c.key === `GET ${url}?status=ACCEPTED`)).toBe(true));
  });

  it('crear con criterios', async () => {
    const api = mockApi({ ...baseRoutes(), [`GET ${url}`]: [], [`POST ${url}`]: row() });
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir entregable' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir entregable' }));
    await user.type(dialog.getByLabelText('Nombre'), 'Portal');
    await user.selectOptions(dialog.getByLabelText('Hito (opcional)'), 'm1');
    await user.type(dialog.getByLabelText('Criterio 1'), 'A');
    await user.click(dialog.getByRole('button', { name: 'Añadir criterio' }));
    await user.type(dialog.getByLabelText('Criterio 2'), 'B');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toMatchObject({ name: 'Portal', milestoneId: 'm1', dueDate: null, criteria: ['A', 'B'] }),
    );
  });
});
