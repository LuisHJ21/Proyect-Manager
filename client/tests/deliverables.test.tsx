import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { localToday } from '@pm/shared';
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

const criteria = [
  { id: 'c1', text: 'Funciona en móvil', met: true, position: 0 },
  { id: 'c2', text: 'Manual', met: false, position: 1 },
];
const full = (over: object = {}) => ({ ...row({ criteriaMet: 1, criteriaTotal: 2 }), description: '<p>Sitio público</p>', criteria, reviews: [], ...over });
const allMet = criteria.map((c) => ({ ...c, met: true }));
const detailRoutes = (d: object) => ({
  ...baseRoutes(),
  [`GET ${url}`]: [row()],
  [`GET ${url}/d2`]: d,
  'GET /api/projects/p1/stakeholders': [{ id: 's1', name: 'Cliente SA' }],
  'GET /api/projects/p1/attachments': [{ id: 'a1', originalName: 'acta.pdf' }],
});
const openDetail = async () => {
  renderApp('/proyectos/p1/entregables');
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver ENT-2' }));
  return within(await screen.findByRole('dialog', { name: 'ENT-2 · Portal publicado' }));
};

describe('detalle de un entregable', () => {
  it('marcar un criterio', async () => {
    const api = mockApi({ ...detailRoutes(full()), [`PATCH ${url}/d2/criteria/c2`]: full({ criteria: allMet }) });
    const dialog = await openDetail();
    await userEvent.setup().click(await dialog.findByRole('checkbox', { name: 'Manual' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/d2/criteria/c2`)?.body).toEqual({ met: true }));
  });

  it('Aceptar desactivado hasta tener todo marcado', async () => {
    mockApi(detailRoutes(full()));
    const dialog = await openDetail();
    expect(await dialog.findByRole('button', { name: 'Aceptar' })).toBeDisabled();
    expect(dialog.getByText('Marca todos los criterios para poder aceptar')).toBeInTheDocument();
  });

  it('con todo marcado Aceptar está activo y un criterio nuevo lo vuelve a desactivar', async () => {
    mockApi({ ...detailRoutes(full({ criteria: allMet })), [`POST ${url}/d2/criteria`]: full({ criteria: [...allMet, { id: 'c3', text: 'Tercero', met: false, position: 2 }] }) });
    const dialog = await openDetail();
    const user = userEvent.setup();
    expect(await dialog.findByRole('button', { name: 'Aceptar' })).toBeEnabled();
    await user.type(dialog.getByLabelText('Nuevo criterio'), 'Tercero');
    await user.click(dialog.getByRole('button', { name: 'Añadir criterio' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Aceptar' })).toBeDisabled());
  });

  it('aceptar con interesado y anexo', async () => {
    const api = mockApi({ ...detailRoutes(full({ criteria: allMet })), [`POST ${url}/d2/reviews`]: full({ status: 'ACCEPTED', criteria: allMet }) });
    const dialog = await openDetail();
    const user = userEvent.setup();
    await user.click(await dialog.findByRole('button', { name: 'Aceptar' }));
    const review = within(screen.getByRole('dialog', { name: 'Aceptar ENT-2' }));
    await waitFor(() => expect(review.getByRole('option', { name: 'Cliente SA' })).toBeInTheDocument());
    await waitFor(() => expect(review.getByRole('option', { name: 'acta.pdf' })).toBeInTheDocument());
    await user.selectOptions(review.getByLabelText('Interesado'), 's1');
    await user.selectOptions(review.getByLabelText('Anexo'), 'a1');
    await user.click(review.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === `POST ${url}/d2/reviews`)?.body).toEqual({
        outcome: 'ACCEPTED',
        stakeholderId: 's1',
        attachmentId: 'a1',
        reviewedOn: localToday(new Date()),
        note: '',
      }),
    );
  });

  it('rechazar exige nota', async () => {
    const api = mockApi({ ...detailRoutes(full()), [`POST ${url}/d2/reviews`]: full({ status: 'REJECTED' }) });
    const dialog = await openDetail();
    const user = userEvent.setup();
    await user.click(await dialog.findByRole('button', { name: 'Rechazar' }));
    const review = within(screen.getByRole('dialog', { name: 'Rechazar ENT-2' }));
    const confirm = review.getByRole('button', { name: 'Rechazar' });
    expect(confirm).toBeDisabled();
    await user.type(review.getByLabelText('Nota'), 'Faltan pruebas');
    await user.click(confirm);
    await waitFor(() => expect(api.calls.find((c) => c.key === `POST ${url}/d2/reviews`)?.body).toMatchObject({ outcome: 'REJECTED', note: 'Faltan pruebas' }));
  });

  it('aceptado: solo lectura y reabrir', async () => {
    const accepted = full({ status: 'ACCEPTED', criteria: allMet });
    const api = mockApi({ ...detailRoutes(accepted), [`PATCH ${url}/d2`]: full({ status: 'PENDING', criteria: allMet }) });
    const dialog = await openDetail();
    expect(await dialog.findByRole('checkbox', { name: 'Manual' })).toBeDisabled();
    expect(dialog.queryByRole('button', { name: 'Añadir criterio' })).not.toBeInTheDocument();
    await userEvent.setup().click(dialog.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `PATCH ${url}/d2`)?.body).toEqual({ status: 'PENDING' }));
  });

  it('historial con anexo eliminado y anexo descargable', async () => {
    const review = (over: object) => ({
      id: 'r1',
      outcome: 'REJECTED',
      stakeholder: null,
      stakeholderName: 'Cliente SA',
      reviewedOn: '2026-11-09',
      note: 'Falta el manual',
      attachment: null,
      attachmentName: 'acta.pdf',
      criteria: [{ text: 'Manual', met: false }],
      createdAt: '2026-11-09T10:00:00.000Z',
      ...over,
    });
    mockApi(detailRoutes(full({ reviews: [review({ id: 'r2', outcome: 'ACCEPTED', note: '', attachment: { id: 'a1', originalName: 'acta.pdf' } }), review({})] })));
    const dialog = await openDetail();
    const history = within(await dialog.findByRole('region', { name: 'Revisiones' }));
    expect(history.getByText('Anexo eliminado')).toBeInTheDocument();
    expect(history.getByRole('link', { name: 'acta.pdf' })).toHaveAttribute('href', '/api/attachments/a1/download');
    expect(history.getAllByText(/Cliente SA/)).toHaveLength(2);
    expect(history.getByText('Falta el manual')).toBeInTheDocument();
  });

  it('editar no muestra criterios', async () => {
    mockApi(detailRoutes(full()));
    const dialog = await openDetail();
    await userEvent.setup().click(await dialog.findByRole('button', { name: 'Editar' }));
    const edit = within(screen.getByRole('dialog', { name: 'Editar ENT-2' }));
    expect(edit.getByLabelText('Nombre')).toHaveValue('Portal publicado');
    expect(edit.queryByText('Criterios de aceptación')).not.toBeInTheDocument();
  });
});
